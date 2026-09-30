/**
 * One REAL call through the production AI path, to verify your ANTHROPIC_API_KEY, model id and request shape.
 * Costs a fraction of a cent. Usage:  ANTHROPIC_API_KEY=sk-ant-... npm run ai:smoke
 * (Optionally set AI_MODEL, AI_REFUSAL_FALLBACK=false, AI_EFFORT.)
 */
import { anthropicProvider } from "../src/core/ai/anthropic";
import { completeStructured } from "../src/core/ai/structured";
import { DEMO_MANUSCRIPT } from "../src/modules/paperfix/demo";
import { selectContext } from "../src/modules/paperfix/context";
import { detectSections } from "../src/core/documents/sections";
import { enforceIntegrity } from "../src/modules/paperfix/guardrails";
import { buildUserPrompt, SYSTEM_PROMPT } from "../src/modules/paperfix/prompt";
import { analysisOutputSchema } from "../src/modules/paperfix/schemas";
import { config } from "../src/core/config";

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error("Set ANTHROPIC_API_KEY first.");
  process.exit(2);
}
const comment = "The sampling procedure is insufficiently described.";
const ctx = selectContext(detectSections(DEMO_MANUSCRIPT), comment, config.ai.maxInputChars);
const provider = anthropicProvider(key);
console.log(`model=${provider.model} fallback=${process.env.AI_REFUSAL_FALLBACK !== "false"}`);

const res = await completeStructured(
  provider, analysisOutputSchema,
  { system: SYSTEM_PROMPT, user: buildUserPrompt({ commentId: "smoke-1", comment, excerpt: ctx.excerpt }), maxTokens: config.ai.maxOutputTokens },
  config.ai.maxRetries,
);
const out = enforceIntegrity(res.data, { manuscript: DEMO_MANUSCRIPT, comment });
console.log(JSON.stringify({ tokens: { in: res.inputTokens, out: res.outputTokens }, attempts: res.attempts, category: out.category, author_input_required: out.author_input_required, missing: out.missing_information, evidence: out.evidence_from_manuscript, confidence: out.confidence }, null, 2));

// The demo manuscript omits the allocation procedure: a correct run MUST ask for it and MUST NOT invent one.
const invented = /randomly (assigned|allocated)|coin|computer-generated|block randomi/i.test(out.suggested_revision);
if (!out.author_input_required || invented) {
  console.error("SMOKE TEST FAILED: the model did not flag the missing allocation procedure, or invented one.");
  process.exit(1);
}
console.log("OK: real model flagged the missing information and invented nothing.");
