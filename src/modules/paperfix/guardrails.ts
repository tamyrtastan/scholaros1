import { AUTHOR_INPUT_REQUIRED, type AnalysisOutput } from "./schemas";

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export interface Sources {
  manuscript: string;
  authorInput?: string;
  comment?: string;
  guidelines?: string;
}

const WORDS: Record<string, string[]> = {
  "2": ["two"], "3": ["three"], "4": ["four"], "5": ["five"], "6": ["six"], "7": ["seven"], "8": ["eight"], "9": ["nine"], "10": ["ten"],
  "11": ["eleven"], "12": ["twelve"], "15": ["fifteen"], "20": ["twenty"], "30": ["thirty"], "40": ["forty"], "50": ["fifty"],
  "60": ["sixty"], "70": ["seventy"], "80": ["eighty"], "90": ["ninety"], "100": ["hundred"],
};

const MARKER = /\[AUTHOR INPUT REQUIRED:[^\]]*\]/g;
// numbers with 2+ digits, decimals or percentages (single digits are usually "Table 2", "Section 3")
const NUMBER = /(?<![\w.])\d+(?:[.,]\d+)+%?|(?<![\w.])\d{2,}%?/g;
const DOI = /\b10\.\d{4,9}\/[^\s"<>)\]]*[^\s"<>)\].,;]/g;
// "Smith et al. (2020)", "Smith and Jones, 2019", "Smith (2020)"
const CITATION = /\b([A-Z][a-zA-Z'-]+)(?:\s+et al\.?|\s+(?:and|&)\s+[A-Z][a-zA-Z'-]+)?,?\s*\(?((?:19|20)\d{2})[a-z]?\)?/g;

/**
 * Specifics in model-written text (figures, DOIs, citations) that appear in none of the allowed sources.
 * Such specifics are the typical shape of fabricated study facts.
 */
export function findUnsupported(text: string, src: Sources): { numbers: string[]; dois: string[]; citations: string[] } {
  const hay = norm([src.manuscript, src.authorInput, src.comment, src.guidelines].filter(Boolean).join("\n"));
  const visible = text.replace(MARKER, " ");
  const forNumbers = visible.replace(DOI, " ").replace(CITATION, " "); // DOIs/citations are judged on their own
  const numbers = [...new Set(forNumbers.match(NUMBER) ?? [])].filter((n) => {
    const bare = n.replace(/[%,]/g, (c) => (c === "," ? "" : ""));
    return !hay.includes(n.toLowerCase()) && !hay.includes(bare) && !(WORDS[bare] ?? []).some((w) => hay.includes(w));
  });
  const dois = [...new Set(visible.match(DOI) ?? [])].filter((d) => !hay.includes(d.toLowerCase()));
  const citations = [...new Set([...visible.matchAll(CITATION)].map((m) => m[0]))].filter((c) => {
    const [, name, year] = c.match(/([A-Z][a-zA-Z'-]+).*?((?:19|20)\d{2})/) ?? [];
    return !(name && year && hay.includes(name.toLowerCase()) && hay.includes(year));
  });
  return { numbers, dois, citations };
}

function neutralise(text: string, bad: string[]): string {
  let out = text;
  for (const b of bad) out = out.split(b).join(`[${AUTHOR_INPUT_REQUIRED}: verify "${b}"]`);
  return out;
}

/**
 * Deterministic integrity checks applied to EVERY analysis regardless of provider.
 * These, not the prompt alone, are what enforce "never fabricate":
 *  1. evidence quotes must be verbatim in the manuscript (or the author's own input), otherwise dropped;
 *  2. if the model's supporting quotes were all fabricated, its claims are unverified => author input required;
 *  3. specifics (numbers, DOIs, citations) absent from every source are replaced by placeholders;
 *  4. any missing information forces author_input_required and visible placeholders.
 */
export function enforceIntegrity(out: AnalysisOutput, sources: Sources | string): AnalysisOutput {
  const src: Sources = typeof sources === "string" ? { manuscript: sources } : sources;
  const hay = norm([src.manuscript, src.authorInput].filter(Boolean).join("\n"));
  const evidence = out.evidence_from_manuscript.filter((q) => q.trim().length > 0 && hay.includes(norm(q)));
  const droppedAll = out.evidence_from_manuscript.length > 0 && evidence.length === 0;

  const missing = [...out.missing_information];
  let revision = out.suggested_revision;
  let response = out.suggested_response_to_reviewer;

  const bad = findUnsupported(`${revision}\n${response}`, src);
  // longest first so a citation/DOI is replaced whole before any shorter token inside it
  const unsupported = [...bad.dois, ...bad.citations, ...bad.numbers].sort((a, b) => b.length - a.length);
  if (unsupported.length) {
    revision = neutralise(revision, unsupported);
    response = neutralise(response, unsupported);
    missing.push(`The proposed text contained details that are not in your manuscript or input (${unsupported.join(", ")}). They were replaced by placeholders; supply or confirm the real details.`);
  }
  if (droppedAll) {
    missing.push("The AI's supporting quotes could not be verified in your manuscript, so its proposed text may assert details you have not provided. Please check it carefully.");
  }

  const required = out.author_input_required || missing.length > 0;
  if (required && missing.length === 0) {
    missing.push("The reviewer's request cannot be answered from the manuscript alone. Please provide the requested details.");
  }
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
    confidence: droppedAll || unsupported.length ? Math.min(out.confidence, 0.4) : out.confidence,
  };
}
