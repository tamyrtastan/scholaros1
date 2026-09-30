export interface ParsedReviewer {
  label: string;
  comments: string[];
}

const REVIEWER_RE = /^\s*(?:#+\s*)?(reviewer|referee)\s*(?:#|no\.?|number)?\s*([0-9]+|[A-Z])\s*[:.)-]?\s*$/i;
const NUMBERED_RE = /^\s*(?:(?:major|minor)\s+)?(?:comment|point|concern|issue)?\s*(?:R\d+\.)?(\d+)\s*[.):\-]\s+/i;

/**
 * Splits pasted reviewer text into reviewers and numbered comments.
 * Recognises "Reviewer 1 / Referee #2 / Reviewer A" headers and "1." "1)" "Comment 1:" numbering,
 * falling back to blank-line-separated paragraphs.
 */
export function parseReviewerComments(raw: string): ParsedReviewer[] {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const blocks: { label: string; lines: string[] }[] = [];
  for (const line of lines) {
    const m = line.match(REVIEWER_RE);
    if (m) blocks.push({ label: `Reviewer ${m[2].toUpperCase()}`, lines: [] });
    else {
      if (!blocks.length) blocks.push({ label: "Reviewer 1", lines: [] });
      blocks[blocks.length - 1].lines.push(line);
    }
  }
  const merged = new Map<string, string[]>();
  for (const b of blocks) {
    const comments = splitComments(b.lines);
    if (comments.length) merged.set(b.label, [...(merged.get(b.label) ?? []), ...comments]);
  }
  return [...merged].map(([label, comments]) => ({ label, comments }));
}

function splitComments(lines: string[]): string[] {
  const numbered = lines.some((l) => NUMBERED_RE.test(l));
  const out: string[] = [];
  if (numbered) {
    let cur: string[] | null = null;
    for (const l of lines) {
      if (NUMBERED_RE.test(l)) {
        if (cur) out.push(cur.join(" "));
        cur = [l.replace(NUMBERED_RE, "")];
      } else if (cur && l.trim()) cur.push(l.trim());
    }
    if (cur) out.push(cur.join(" "));
  } else {
    for (const para of lines.join("\n").split(/\n\s*\n/)) if (para.trim()) out.push(para.replace(/\s*\n\s*/g, " "));
  }
  return out.map((c) => c.trim()).filter((c) => c.length > 0);
}
