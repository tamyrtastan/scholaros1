import { AppError } from "../errors";
import type { FileKind } from "./files";

export function normalizeText(s: string): string {
  return s.replace(/\r\n?/g, "\n").replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

export async function extractText(kind: FileKind, data: Buffer): Promise<string> {
  try {
    let text: string;
    if (kind === "txt") text = data.toString("utf8");
    else if (kind === "docx") {
      const mammoth = await import("mammoth");
      text = (await mammoth.extractRawText({ buffer: data })).value;
    } else {
      const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
      const pdf = await getDocumentProxy(new Uint8Array(data));
      text = (await pdfText(pdf, { mergePages: true })).text;
    }
    const out = normalizeText(text);
    if (out.length < 20) throw new AppError("No readable text found. Scanned PDFs are not supported yet; upload DOCX or a text-based PDF.");
    return out;
  } catch (e) {
    if (e instanceof AppError) throw e;
    throw new AppError("Could not read this file. Try exporting it again as DOCX or PDF.");
  }
}
