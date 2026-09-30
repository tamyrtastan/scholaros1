import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from "docx";
import { AUTHOR_INPUT_REQUIRED } from "./schemas";
import { buildResponseEntry, type ProjectBundle } from "./service";

export interface LetterModel {
  title: string;
  journal: string;
  pendingCount: number;
  reviewers: { label: string; items: { number: number; comment: string; response: string; changes: string; location: string }[] }[];
}

/** Pure: assembles the Response to Reviewers from stored entries (falling back to generated ones). */
export function buildLetterModel(b: ProjectBundle): LetterModel {
  let pending = 0;
  const reviewers = b.reviewers.map((r) => ({
    label: r.label,
    items: b.comments
      .filter((c) => c.reviewer_id === r.id)
      .map((c) => {
        const e =
          b.responses.find((x) => x.reviewer_comment_id === c.id) ??
          buildResponseEntry(b.analyses.find((a) => a.reviewer_comment_id === c.id), b.revisions.find((v) => v.reviewer_comment_id === c.id));
        const item = {
          number: c.comment_number, comment: c.original_comment, response: e.author_response,
          changes: e.change_summary, location: e.manuscript_location,
        };
        pending += [item.response, item.changes, item.location].filter((t) => t.includes(AUTHOR_INPUT_REQUIRED)).length;
        return item;
      }),
  }));
  return { title: b.project.title, journal: b.project.journal_name ?? "", pendingCount: pending, reviewers };
}

const FONT = "Times New Roman";
const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? 23, bold: o.bold, italics: o.italics, color: o.color });

/** Multi-line text -> paragraphs; AUTHOR INPUT REQUIRED placeholders are made visually obvious. */
function para(text: string, opts: { indent?: number } = {}) {
  return text.split("\n").map((line) => {
    const parts = line.split(/(\[AUTHOR INPUT REQUIRED:[^\]]*\])/);
    return new Paragraph({
      spacing: { after: 100, line: 300 },
      indent: opts.indent ? { left: opts.indent } : undefined,
      children: parts.map((p) => (p.startsWith("[AUTHOR INPUT REQUIRED") ? run(p, { bold: true, color: "B00020" }) : run(p))),
    });
  });
}
const heading = (text: string, level: (typeof HeadingLevel)[keyof typeof HeadingLevel]) =>
  new Paragraph({ heading: level, spacing: { before: 280, after: 120 }, children: [run(text, { bold: true, size: level === HeadingLevel.HEADING_1 ? 32 : 26 })] });
const label = (t: string) => new Paragraph({ spacing: { before: 100, after: 40 }, children: [run(t, { bold: true })] });

export async function buildResponseDocx(b: ProjectBundle): Promise<Buffer> {
  const m = buildLetterModel(b);
  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [run("Response to Reviewers", { bold: true, size: 36 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run(m.title, { italics: true })] }),
  ];
  if (m.journal) children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [run(m.journal)] }));
  children.push(...para("We thank the editor and reviewers for their constructive feedback. Below we respond to each comment in turn."));
  if (m.pendingCount > 0) {
    children.push(...para(`[${AUTHOR_INPUT_REQUIRED}: ${m.pendingCount} item(s) below still need your input before this letter is ready to send.]`));
  }
  for (const r of m.reviewers) {
    children.push(heading(r.label, HeadingLevel.HEADING_1));
    for (const i of r.items) {
      children.push(heading(`Comment ${i.number}`, HeadingLevel.HEADING_2), ...para(i.comment, { indent: 360 }));
      children.push(label("Response:"), ...para(i.response));
      children.push(label("Changes made:"), ...para(i.changes || "—"));
      children.push(label("Location:"), ...para(i.location));
    }
  }
  const doc = new Document({ creator: "PaperFix AI (ScholarOS)", title: "Response to Reviewers", sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

const cell = (t: string, bold = false) =>
  new TableCell({ width: { size: 20, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [run(t, { bold, size: 20 })] })] });

export async function buildReportDocx(b: ProjectBundle): Promise<Buffer> {
  const rows = b.comments.map((c) => {
    const r = b.reviewers.find((x) => x.id === c.reviewer_id);
    const rev = b.revisions.find((x) => x.reviewer_comment_id === c.id);
    return [`${r?.label ?? ""} #${c.comment_number}`, c.category ?? "—", c.status.replace(/_/g, " "), rev?.author_decision ?? "—", b.analyses.find((a) => a.reviewer_comment_id === c.id)?.manuscript_section || "—"];
  });
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: ["Comment", "Category", "Status", "Decision", "Section"].map((h) => cell(h, true)) }),
      ...rows.map((r) => new TableRow({ children: r.map((t) => cell(t)) })),
    ],
  });
  const children: (Paragraph | Table)[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [run("Revision Report", { bold: true, size: 36 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(b.project.title, { italics: true })] }),
    ...para("Generated by PaperFix AI. Suggestions use only information contained in the manuscript and in author-provided input. Nothing here has been invented; missing information is marked AUTHOR INPUT REQUIRED."),
    heading("Overview", HeadingLevel.HEADING_1),
    table,
  ];
  for (const r of b.reviewers) {
    children.push(heading(r.label, HeadingLevel.HEADING_1));
    for (const c of b.comments.filter((x) => x.reviewer_id === r.id)) {
      const a = b.analyses.find((x) => x.reviewer_comment_id === c.id);
      const rev = b.revisions.find((x) => x.reviewer_comment_id === c.id);
      children.push(heading(`Comment ${c.comment_number} (${c.category ?? "unanalysed"}, ${c.status.replace(/_/g, " ")})`, HeadingLevel.HEADING_2), ...para(c.original_comment, { indent: 360 }));
      if (!a) { children.push(...para("Not analysed yet.")); continue; }
      children.push(label("Issue identified:"), ...para(a.issue_summary));
      children.push(label("Requested action:"), ...para(a.requested_action));
      children.push(label("Relevant section:"), ...para(a.relevant_sections.join(", ") || "Not identified"));
      children.push(label("Evidence from manuscript:"), ...para(a.evidence_from_manuscript.map((e) => `"${e}"`).join("\n") || "No directly relevant passage found."));
      if (a.missing_information.length) children.push(label("Missing information:"), ...para(a.missing_information.map((m) => `• ${m}`).join("\n")));
      children.push(label(`Proposed change (${rev?.author_decision ?? "pending"}):`), ...para(rev?.proposed_text ?? a.suggested_revision));
      children.push(label("Analysis confidence:"), ...para(`${Math.round(a.confidence * 100)}% (${a.provider})`));
    }
  }
  const doc = new Document({ creator: "PaperFix AI (ScholarOS)", title: "Revision Report", sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

/** Portable export (also useful for debugging). Excludes the manuscript body and internal cache hashes. */
export function buildJsonExport(b: ProjectBundle) {
  return {
    exported_at: new Date().toISOString(),
    project: { title: b.project.title, journal_name: b.project.journal_name },
    reviewers: b.reviewers.map((r) => ({
      label: r.label,
      comments: b.comments.filter((c) => c.reviewer_id === r.id).map((c) => {
        const a = b.analyses.find((x) => x.reviewer_comment_id === c.id);
        const rev = b.revisions.find((x) => x.reviewer_comment_id === c.id);
        const resp = b.responses.find((x) => x.reviewer_comment_id === c.id);
        return {
          number: c.comment_number, original_comment: c.original_comment, category: c.category, status: c.status,
          analysis: a && { issue_summary: a.issue_summary, requested_action: a.requested_action, evidence_from_manuscript: a.evidence_from_manuscript, missing_information: a.missing_information, author_input_required: a.author_input_required, confidence: a.confidence },
          revision: rev && { original_text: rev.original_text, proposed_text: rev.proposed_text, decision: rev.author_decision, location: rev.location },
          response: resp && { author_response: resp.author_response, change_summary: resp.change_summary, manuscript_location: resp.manuscript_location },
        };
      }),
    })),
  };
}
