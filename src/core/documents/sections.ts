/**
 * Heuristic section detection. It is a best-effort guess: each section carries a confidence and
 * when nothing is recognised we fall back to one "Full text" section with low confidence.
 */
export interface ParsedSection {
  name: string; // canonical name, e.g. "Methods"
  heading: string; // heading as written
  text: string;
  confidence: number;
}

const CANON: [string, RegExp][] = [
  ["Abstract", /^abstract$/i],
  ["Introduction", /^(introduction|background)$/i],
  ["Literature Review", /^(literature review|related work|theoretical (background|framework)|review of (the )?literature)$/i],
  ["Methods", /^(methods?|methodology|materials and methods|methods and materials|research design|study design|participants and methods|experimental (design|methods?))$/i],
  ["Results", /^(results?|findings|results and analysis)$/i],
  ["Discussion", /^(discussion|results and discussion|general discussion)$/i],
  ["Conclusion", /^(conclusions?|concluding remarks|conclusion and future work)$/i],
  ["References", /^(references|bibliography|works cited)$/i],
];

function canonFor(line: string): string | null {
  const cleaned = line
    .replace(/^#+\s*/, "")
    .replace(/^(\d+(\.\d+)*|[IVX]+)[.)]?\s+/, "")
    .replace(/[:.]$/, "")
    .trim();
  if (cleaned.length > 60) return null;
  return CANON.find(([, re]) => re.test(cleaned))?.[0] ?? null;
}

export function detectSections(text: string): ParsedSection[] {
  const lines = text.split("\n");
  const marks: { idx: number; name: string; heading: string }[] = [];
  lines.forEach((l, i) => {
    const t = l.trim();
    if (!t) return;
    const name = canonFor(t);
    if (name) marks.push({ idx: i, name, heading: t });
  });

  // Keep first occurrence of each canonical heading after the first mark (avoids table-of-contents duplicates).
  const seen = new Set<string>();
  const uniq = marks.filter((m) => (seen.has(m.name) ? false : (seen.add(m.name), true)));

  if (uniq.length < 2) {
    return [{ name: "Full text", heading: "", text, confidence: 0.2 }];
  }
  const out: ParsedSection[] = [];
  const first = uniq[0].idx;
  const preamble = lines.slice(0, first).join("\n").trim();
  if (preamble) out.push({ name: "Title", heading: "", text: preamble, confidence: 0.5 });
  uniq.forEach((m, i) => {
    const end = i + 1 < uniq.length ? uniq[i + 1].idx : lines.length;
    const body = lines.slice(m.idx + 1, end).join("\n").trim();
    out.push({ name: m.name, heading: m.heading, text: body, confidence: body.length > 40 ? 0.85 : 0.5 });
  });
  return out;
}

export function sectionByName(sections: ParsedSection[], name: string): ParsedSection | undefined {
  return sections.find((s) => s.name.toLowerCase() === name.toLowerCase());
}
