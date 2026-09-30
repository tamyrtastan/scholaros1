import { describe, expect, it } from "vitest";
import { Document, Packer, Paragraph } from "docx";
import { detectFileKind } from "@/core/documents/files";
import { extractText } from "@/core/documents/extract";
import { detectSections } from "@/core/documents/sections";
import { parseReviewerComments } from "@/core/documents/reviewer-comments";
import { sanitizeFilename } from "@/core/storage";
import { DEMO_COMMENTS, DEMO_MANUSCRIPT } from "@/modules/paperfix/demo";

describe("file validation", () => {
  it("checks magic bytes, not just extension", () => {
    expect(() => detectFileKind("a.pdf", Buffer.from("not a pdf at all"))).toThrow(/valid PDF/);
    expect(() => detectFileKind("a.docx", Buffer.from("plain text"))).toThrow(/valid DOCX/);
    expect(() => detectFileKind("a.exe", Buffer.from("MZ"))).toThrow(/Unsupported/);
    expect(() => detectFileKind("a.txt", Buffer.alloc(0))).toThrow(/empty/);
    expect(() => detectFileKind("a.txt", Buffer.alloc(11 * 1024 * 1024, 65))).toThrow(/too large/);
    expect(detectFileKind("a.PDF", Buffer.from("%PDF-1.4 ..."))).toBe("pdf");
  });
  it("sanitizes filenames", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename("My Paper (final).docx")).toBe("My_Paper_final.docx");
    expect(sanitizeFilename("...")).toBe("file");
  });
});

describe("text extraction", () => {
  it("reads txt", async () => {
    expect(await extractText("txt", Buffer.from("Hello world, this is a manuscript."))).toContain("Hello world");
  });
  it("reads docx produced by the docx library", async () => {
    const buf = Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Abstract"), new Paragraph("This is the abstract of a test paper.")] }] })));
    const text = await extractText("docx", buf);
    expect(text).toContain("This is the abstract");
  });
  it("reads a text PDF", async () => {
    const pdf = minimalPdf("Hello PDF manuscript text for extraction");
    expect(await extractText("pdf", pdf)).toContain("Hello PDF manuscript");
  });
  it("gives a friendly error for garbage", async () => {
    await expect(extractText("pdf", Buffer.from("%PDF-1.4 garbage"))).rejects.toThrow(/Could not read|No readable/);
  });
});

function minimalPdf(text: string): Buffer {
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`.length} >>\nstream\nBT /F1 12 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offs.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out);
}

describe("section detection", () => {
  it("finds standard sections in the demo manuscript", () => {
    const s = detectSections(DEMO_MANUSCRIPT);
    expect(s.map((x) => x.name)).toEqual(["Title", "Abstract", "Introduction", "Methods", "Results", "Discussion", "Conclusion", "References"]);
    expect(s.find((x) => x.name === "Methods")!.text).toContain("waiting-list control group");
  });
  it("handles numbered headings and falls back with low confidence when nothing is found", () => {
    const s = detectSections("1. Introduction\nBlah blah.\n2. Methods\nWe did things.");
    expect(s.map((x) => x.name)).toEqual(["Introduction", "Methods"]);
    const f = detectSections("Just a wall of text with no headings at all.");
    expect(f).toHaveLength(1);
    expect(f[0].name).toBe("Full text");
    expect(f[0].confidence).toBeLessThan(0.5);
  });
});

describe("reviewer comment parsing", () => {
  it("splits multiple reviewers and numbered comments", () => {
    const r = parseReviewerComments(DEMO_COMMENTS);
    expect(r.map((x) => x.label)).toEqual(["Reviewer 1", "Reviewer 2"]);
    expect(r.map((x) => x.comments.length)).toEqual([3, 3]);
    expect(r[0].comments[0]).toMatch(/^The sampling procedure/);
  });
  it("supports header variants, multi-line comments and no numbering", () => {
    const r = parseReviewerComments("Referee #2:\nFirst point\ncontinues here.\n\nSecond point.");
    expect(r).toEqual([{ label: "Reviewer 2", comments: ["First point continues here.", "Second point."] }]);
    expect(parseReviewerComments("Comment 1: Fix X.\nComment 2: Fix Y.")[0].comments).toEqual(["Fix X.", "Fix Y."]);
  });
  it("returns nothing for empty input", () => {
    expect(parseReviewerComments("  \n ")).toEqual([]);
  });
});
