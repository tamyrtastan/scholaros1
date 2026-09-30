import type { ParsedSection } from "@/core/documents/sections";

const STOP = new Set("the a an and or of to in on for with is are was were be been this that these those it its as by at from we our you your please could would should which what how why not no more less than also any all can may might have has had do does did there their them they into about over under between".split(" "));

export const words = (s: string) => (s.toLowerCase().match(/[a-z][a-z-]{2,}/g) ?? []).filter((w) => !STOP.has(w));

const PRIORS: [RegExp, string[]][] = [
  [/sampl|recruit|participant|allocat|random|assign|procedure|method|design|protocol|measure|instrument/i, ["Methods"]],
  [/statist|p-?value|signific|effect size|power|regress|anova|confidence interval|test/i, ["Methods", "Results"]],
  [/literature|prior|previous|related|novel|contribution|background|cite|citation/i, ["Introduction", "Literature Review"]],
  [/interpret|overclaim|causal|generali[sz]|limitation|implication|discuss/i, ["Discussion", "Conclusion"]],
  [/abstract|title/i, ["Abstract", "Title"]],
  [/reference|doi|bibliograph/i, ["References"]],
  [/figure|table|plot|graph/i, ["Results"]],
  [/ethic|consent|irb|approval/i, ["Methods"]],
  [/conclusion/i, ["Conclusion"]],
];

function paragraphs(text: string) {
  return text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
}

/**
 * Picks the parts of the manuscript relevant to ONE comment, capped at maxChars.
 * Avoids sending the whole manuscript per comment (the main AI cost driver).
 */
export function selectContext(sections: ParsedSection[], comment: string, maxChars: number) {
  const cw = new Set(words(comment));
  const prior = new Set(PRIORS.filter(([re]) => re.test(comment)).flatMap(([, s]) => s));
  const scored = sections
    .filter((s) => (s.name !== "References" || prior.has("References")) && (s.name !== "Title" || prior.has("Title")))
    .map((s) => {
      const overlap = words(s.text).filter((w) => cw.has(w)).length;
      return { s, score: (prior.has(s.name) ? 1000 : 0) + overlap };
    })
    .sort((a, b) => b.score - a.score);

  const chosen: { name: string; text: string }[] = [];
  let budget = maxChars;
  for (const { s, score } of scored) {
    if (budget < 300) break;
    if (score === 0 && chosen.length > 0) break;
    let text = s.text;
    if (text.length > budget) {
      // keep the highest-overlap paragraphs, in original order
      const ps = paragraphs(text).map((p, i) => ({ p, i, sc: words(p).filter((w) => cw.has(w)).length }));
      const keep = new Set<number>();
      let used = 0;
      for (const x of [...ps].sort((a, b) => b.sc - a.sc)) {
        if (used + x.p.length > budget) continue;
        keep.add(x.i);
        used += x.p.length + 1;
      }
      text = ps.filter((x) => keep.has(x.i)).map((x) => x.p).join("\n");
    }
    if (!text) continue;
    chosen.push({ name: s.name, text });
    budget -= text.length;
  }
  // `chosen` stays in relevance order: the first section is the primary one for this comment.
  return {
    sectionNames: chosen.map((c) => c.name),
    excerpt: chosen.map((c) => `<section name="${c.name}">\n${c.text}\n</section>`).join("\n"),
    rawText: chosen.map((c) => c.text).join("\n"),
  };
}
