import type { AiProvider } from "@/core/ai/provider";
import { words } from "./context";
import { CATEGORIES, type AnalysisOutput, type Category } from "./schemas";

/**
 * Offline, deterministic stand-in for the LLM. It emits JSON text so the exact same parsing,
 * validation and integrity guardrails run as with a real model. Heuristic only: good enough to
 * demonstrate the workflow, NOT a substitute for real analysis.
 */

const tag = (s: string, name: string) => s.match(new RegExp(`<${name}>\\n?([\\s\\S]*?)\\n?</${name}>`))?.[1]?.trim() ?? "";

const CATEGORY_RULES: [Category, RegExp][] = [
  ["ethics", /ethic|consent|irb|approval/i],
  ["statistics", /statistic|p-?value|signific|effect size|power|regression|anova|confidence interval|multiple (comparison|testing)/i],
  ["methodology", /sampl|method|design|procedure|randomi|allocat|recruit|assign|protocol|measure|instrument|control group/i],
  ["references", /reference|citation|doi|bibliograph/i],
  ["literature", /literature|prior work|previous (work|stud)|related work|novelty|contribution/i],
  ["figures_tables", /figure|table|plot|graph|caption/i],
  ["interpretation", /interpret|overclaim|causal|generali[sz]|conclusion|limitation|implication|overstat/i],
  ["language", /language|grammar|english|typo|proofread|wording|spelling/i],
  ["formatting", /format|template|word limit|guideline|style/i],
  ["presentation", /clarity|unclear|structure|organi[sz]|flow|presentation|confusing/i],
];

interface MissingRule {
  trigger: RegExp;
  present: RegExp;
  onlyIf?: RegExp; // the rule only applies when the manuscript mentions this
  item: string;
}
const MISSING_RULES: MissingRule[] = [
  {
    trigger: /allocat|assign|randomi|sampl|group|control/i,
    present: /random(ly|i[sz]ed|i[sz]ation)|allocated (by|using|via)|allocation (was|were|procedure|sequence)|assigned (by|using|via)/i,
    onlyIf: /\b(groups?|conditions?|arms?)\b/i,
    item: "How participants were allocated or assigned to groups (method, sequence generation, concealment).",
  },
  {
    trigger: /sampl|recruit|selection|inclusion|exclusion/i,
    present: /convenience|purposive|stratified|random sampl|snowball|quota|recruited (via|through|from|by|at)|inclusion criteria/i,
    item: "How participants were sampled and recruited (sampling frame, selection method, inclusion/exclusion criteria).",
  },
  {
    trigger: /sample size|power|how many participants/i,
    present: /power analysis|a priori|G\*Power|sample size (was|were) (determined|calculated|chosen)/i,
    item: "Justification for the sample size (power analysis or other rationale).",
  },
  {
    trigger: /ethic|consent|irb|approval/i,
    present: /(approv|ethics committee|institutional review board|IRB)[^.]{0,120}(no\.?|number|reference|protocol|#)\s*[\w-]+/i,
    item: "Name of the ethics committee and the approval reference number (and how informed consent was obtained).",
  },
  {
    trigger: /effect size/i,
    present: /cohen|effect size|eta|η|\bd\s*=/i,
    item: "Effect sizes for the reported tests (they cannot be computed without your data).",
  },
  {
    trigger: /confidence interval/i,
    present: /confidence interval|95% ?CI/i,
    item: "Confidence intervals for the reported estimates.",
  },
  {
    trigger: /multiple (comparison|testing)/i,
    present: /bonferroni|holm|fdr|benjamini|corrected for multiple/i,
    item: "Whether and how a multiple-comparison correction was applied.",
  },
  {
    trigger: /data availab|open data|code availab|repository/i,
    present: /available (at|in|from|on|upon)|osf\.io|zenodo|github/i,
    item: "Data/code availability statement and repository location.",
  },
  {
    trigger: /(additional|more|recent|relevant|missing).{0,30}(literature|references|studies|citations)|should cite|cite the/i,
    present: /$^/,
    item: "The specific references you want to add. PaperFix never invents citations; please supply them.",
  },
];

function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter((s) => s.length > 25 && s.length < 400);
}

export function mockAnalyze(input: { commentId: string; comment: string; excerpt: string; authorInput: string }): AnalysisOutput {
  const { commentId, comment, excerpt, authorInput } = input;
  const category = CATEGORY_RULES.find(([, re]) => re.test(comment))?.[0] ?? "other";
  const sectionNames = [...excerpt.matchAll(/<section name="([^"]+)">/g)].map((m) => m[1]);
  const body = excerpt.replace(/<\/?section[^>]*>/g, "");
  const cw = new Set(words(comment));

  const evidence = sentences(body)
    .map((s) => ({ s, sc: words(s).filter((w) => cw.has(w)).length }))
    .filter((x) => x.sc >= 2)
    .sort((a, b) => b.sc - a.sc)
    .slice(0, 2)
    .map((x) => x.s);

  const missing = authorInput
    ? []
    : MISSING_RULES.filter((r) => r.trigger.test(comment) && (!r.onlyIf || r.onlyIf.test(body)) && !r.present.test(body)).map((r) => r.item);

  const first = comment.split(/(?<=[.!?])\s+/)[0].slice(0, 300);
  const section = sectionNames[0] ?? "relevant section";
  let revision: string;
  let response: string;
  if (missing.length) {
    revision = missing.map((m) => `[AUTHOR INPUT REQUIRED: ${m}]`).join("\n");
    response = `We thank the reviewer for this comment. ${missing.map((m) => `[AUTHOR INPUT REQUIRED: ${m}]`).join(" ")}`;
  } else if (authorInput) {
    revision = `Add to the ${section} section (author-provided text, insert as written):\n${authorInput}`;
    response = `We thank the reviewer for this helpful comment. We have expanded the ${section} section to address it, as described in the revised manuscript.`;
  } else {
    revision = evidence.length
      ? `Revise the ${section} section to address the request, working only from details already reported. Current text: "${evidence[0]}"`
      : `Revise the ${section} section to address the request using only details already present in your manuscript.`;
    response = `We thank the reviewer for this comment. We have revised the ${section} section accordingly.`;
  }

  return {
    comment_id: commentId,
    category: CATEGORIES.includes(category) ? category : "other",
    issue_summary: first,
    requested_action: `Address the reviewer's point: "${first}"`,
    relevant_manuscript_sections: sectionNames.slice(0, 3),
    evidence_from_manuscript: evidence,
    missing_information: missing,
    author_input_required: missing.length > 0,
    suggested_revision: revision,
    suggested_response_to_reviewer: response,
    confidence: missing.length ? 0.45 : Math.min(0.85, 0.5 + evidence.length * 0.15),
  };
}

export const mockProvider: AiProvider = {
  name: "mock",
  model: "mock-heuristic-v1",
  async complete(req) {
    const out = mockAnalyze({
      commentId: tag(req.user, "comment_id"),
      comment: tag(req.user, "reviewer_comment"),
      excerpt: tag(req.user, "manuscript_excerpt"),
      authorInput: tag(req.user, "author_input"),
    });
    const text = JSON.stringify(out);
    return { text, inputTokens: Math.ceil((req.system.length + req.user.length) / 4), outputTokens: Math.ceil(text.length / 4) };
  },
};
