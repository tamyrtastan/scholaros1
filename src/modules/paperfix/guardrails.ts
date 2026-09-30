import { AUTHOR_INPUT_REQUIRED, type AnalysisOutput } from "./schemas";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Deterministic integrity checks applied to EVERY analysis regardless of provider.
 * These, not the prompt alone, are what enforce "never fabricate".
 */
export function enforceIntegrity(out: AnalysisOutput, manuscriptText: string): AnalysisOutput {
  const hay = norm(manuscriptText);
  const evidence = out.evidence_from_manuscript.filter((q) => q.trim().length > 0 && hay.includes(norm(q)));
  const droppedAll = out.evidence_from_manuscript.length > 0 && evidence.length === 0;

  const missing = [...out.missing_information];
  const required = out.author_input_required || missing.length > 0;
  if (required && missing.length === 0) {
    missing.push("The reviewer's request cannot be answered from the manuscript alone. Please provide the requested details.");
  }

  let revision = out.suggested_revision;
  let response = out.suggested_response_to_reviewer;
  if (required) {
    const marker = missing.map((m) => `[${AUTHOR_INPUT_REQUIRED}: ${m}]`).join("\n");
    if (!revision.includes(AUTHOR_INPUT_REQUIRED)) revision = `${revision}${revision ? "\n" : ""}${marker}`;
    if (!response.includes(AUTHOR_INPUT_REQUIRED)) response = `${response}${response ? "\n" : ""}${marker}`;
  }

  return {
    ...out,
    evidence_from_manuscript: evidence,
    missing_information: missing,
    author_input_required: required,
    suggested_revision: revision,
    suggested_response_to_reviewer: response,
    confidence: droppedAll ? Math.min(out.confidence, 0.4) : out.confidence,
  };
}
