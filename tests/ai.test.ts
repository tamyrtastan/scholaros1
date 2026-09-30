import { describe, expect, it } from "vitest";
import { analysisOutputSchema, type AnalysisOutput } from "@/modules/paperfix/schemas";
import { completeStructured, extractJson } from "@/core/ai/structured";
import type { AiProvider } from "@/core/ai/provider";
import { enforceIntegrity, findUnsupported } from "@/modules/paperfix/guardrails";
import { mockAnalyze } from "@/modules/paperfix/mock-ai";
import { selectContext } from "@/modules/paperfix/context";
import { detectSections } from "@/core/documents/sections";
import { DEMO_MANUSCRIPT } from "@/modules/paperfix/demo";

const valid: AnalysisOutput = {
  comment_id: "c1", category: "methodology", issue_summary: "s", requested_action: "a",
  relevant_manuscript_sections: ["Methods"], evidence_from_manuscript: [], missing_information: [],
  author_input_required: false, suggested_revision: "r", suggested_response_to_reviewer: "t", confidence: 0.7,
};

describe("analysis schema", () => {
  it("accepts a valid object and rejects bad category / confidence / missing fields", () => {
    expect(analysisOutputSchema.safeParse(valid).success).toBe(true);
    expect(analysisOutputSchema.safeParse({ ...valid, category: "astrology" }).success).toBe(false);
    expect(analysisOutputSchema.safeParse({ ...valid, confidence: 1.5 }).success).toBe(false);
    const { issue_summary: _omit, ...rest } = valid;
    void _omit;
    expect(analysisOutputSchema.safeParse(rest).success).toBe(false);
  });
  it("extracts JSON from fenced or chatty output", () => {
    expect(extractJson('Sure!\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('here {"a":2} done')).toEqual({ a: 2 });
    expect(() => extractJson("nothing")).toThrow();
  });
});

function scripted(replies: string[]): AiProvider & { calls: number } {
  const p = {
    name: "t", model: "t", calls: 0,
    async complete() {
      const text = replies[Math.min(p.calls, replies.length - 1)];
      p.calls++;
      return { text, inputTokens: 10, outputTokens: 5 };
    },
  };
  return p;
}
const req = { system: "s", user: "u", maxTokens: 100 };

describe("completeStructured", () => {
  it("retries once on invalid output, sums token usage", async () => {
    const p = scripted(["not json", JSON.stringify(valid)]);
    const r = await completeStructured(p, analysisOutputSchema, req, 2);
    expect(r.attempts).toBe(2);
    expect(r.inputTokens).toBe(20);
    expect(p.calls).toBe(2);
  });
  it("gives up after maxRetries (bounded cost)", async () => {
    const p = scripted(["nope"]);
    await expect(completeStructured(p, analysisOutputSchema, req, 1)).rejects.toThrow(/failed validation/);
    expect(p.calls).toBe(2);
  });
});

describe("integrity guardrails", () => {
  it("drops evidence quotes that are not verbatim in the manuscript and lowers confidence", () => {
    const out = enforceIntegrity({ ...valid, confidence: 0.9, evidence_from_manuscript: ["We randomly assigned 60 students by coin flip."] }, DEMO_MANUSCRIPT);
    expect(out.evidence_from_manuscript).toEqual([]);
    expect(out.confidence).toBeLessThanOrEqual(0.4);
  });
  it("keeps genuine quotes (whitespace/case-insensitive)", () => {
    const out = enforceIntegrity({ ...valid, evidence_from_manuscript: ["thirty students were in the  APP group"] }, DEMO_MANUSCRIPT);
    expect(out.evidence_from_manuscript).toHaveLength(1);
  });
  it("forces author_input_required and placeholders when info is missing", () => {
    const out = enforceIntegrity({ ...valid, missing_information: ["Allocation method"], author_input_required: false }, "text");
    expect(out.author_input_required).toBe(true);
    expect(out.suggested_revision).toContain("AUTHOR INPUT REQUIRED");
    expect(out.suggested_response_to_reviewer).toContain("AUTHOR INPUT REQUIRED: Allocation method");
  });
  it("adds a generic missing item when the model flags input required without listing any", () => {
    const out = enforceIntegrity({ ...valid, author_input_required: true }, "text");
    expect(out.missing_information).toHaveLength(1);
  });
});

describe("unsupported specifics (fabrication detector)", () => {
  const src = { manuscript: DEMO_MANUSCRIPT, authorInput: "We used a sealed-envelope draw with 12 envelopes.", comment: "Please report effect sizes." };
  it("flags numbers, DOIs and citations that appear in no source; allows ones that do", () => {
    const f = findUnsupported("Mean PSS fell from 24.1 to 19.8 (n = 60). Effect size d = 0.85, p = 0.003; see Smith et al. (2019) doi 10.1234/abcd.5678. We used 12 envelopes; thirty per group.", src);
    expect(f.numbers).toEqual(["0.85"]);
    expect(f.dois).toEqual(["10.1234/abcd.5678"]);
    expect(f.citations.join(" ")).toMatch(/Smith/);
  });
  it("replaces unsupported specifics with verify-placeholders and forces author input", () => {
    const out = enforceIntegrity({ ...valid, suggested_revision: "The effect size was d = 0.85 (95% CI 0.4 to 1.3).", suggested_response_to_reviewer: "Added d = 0.85." }, src);
    expect(out.suggested_revision).toContain('[AUTHOR INPUT REQUIRED: verify "0.85"]');
    expect(out.suggested_revision).not.toMatch(/d = 0\.85(?!")/);
    expect(out.author_input_required).toBe(true);
    expect(out.missing_information.join(" ")).toMatch(/not in your manuscript/);
  });
  it("does not flag text made only of supported facts (incl. author-provided ones)", () => {
    const out = enforceIntegrity({ ...valid, suggested_revision: "Thirty students used a sealed-envelope draw with 12 envelopes; scores changed from 24.1 to 19.8.", suggested_response_to_reviewer: "Done." }, src);
    expect(out.author_input_required).toBe(false);
    expect(out.suggested_revision).not.toContain("verify");
  });
  it("accepts evidence quoted from the author's own input", () => {
    const out = enforceIntegrity({ ...valid, evidence_from_manuscript: ["sealed-envelope draw with 12 envelopes"] }, src);
    expect(out.evidence_from_manuscript).toHaveLength(1);
    expect(out.author_input_required).toBe(false);
  });
});

describe("author_input_required behaviour (mock model)", () => {
  const sections = detectSections(DEMO_MANUSCRIPT);
  const run = (comment: string, authorInput = "") => {
    const ctx = selectContext(sections, comment, 24000);
    return enforceIntegrity(mockAnalyze({ commentId: "x", comment, excerpt: ctx.excerpt, authorInput }), DEMO_MANUSCRIPT);
  };
  it("flags the missing allocation procedure and does not invent one", () => {
    const out = run("The sampling procedure is insufficiently described.");
    expect(out.author_input_required).toBe(true);
    expect(out.missing_information.join(" ")).toMatch(/allocated or assigned/i);
    expect(out.suggested_revision).toContain("AUTHOR INPUT REQUIRED");
    expect(out.suggested_revision).not.toMatch(/random(ly|ised|ized)|coin|computer-generated/i);
  });
  it("flags ethics approval number and effect sizes as missing", () => {
    expect(run("Please report the ethics approval reference number.").author_input_required).toBe(true);
    expect(run("Please add effect sizes.").missing_information.join(" ")).toMatch(/effect size/i);
  });
  it("never invents citations", () => {
    const out = run("The introduction should discuss additional recent literature.");
    expect(out.author_input_required).toBe(true);
    expect(out.suggested_revision).not.toMatch(/\(\d{4}\)|doi|et al/i);
  });
  it("does not require input for a language comment, and uses author input when supplied", () => {
    expect(run("The language needs proofreading.").author_input_required).toBe(false);
    const withInput = run("The sampling procedure is insufficiently described.", "Participants were allocated using a sealed-envelope method.");
    expect(withInput.author_input_required).toBe(false);
    expect(withInput.suggested_revision).toContain("sealed-envelope");
  });
});

describe("context selection (cost control)", () => {
  it("sends a small relevant excerpt, not the whole manuscript", () => {
    const sections = detectSections(DEMO_MANUSCRIPT);
    const ctx = selectContext(sections, "The sampling procedure is insufficiently described.", 24000);
    expect(ctx.sectionNames).toContain("Methods");
    expect(ctx.sectionNames).not.toContain("References");
    expect(ctx.excerpt.length).toBeLessThan(DEMO_MANUSCRIPT.length);
  });
  it("respects the character cap", () => {
    const big = "Methods\n" + "We sampled participants carefully. ".repeat(2000) + "\nResults\nShort.";
    const ctx = selectContext(detectSections(big), "sampling", 1000);
    expect(ctx.rawText.length).toBeLessThanOrEqual(1100);
  });
});
