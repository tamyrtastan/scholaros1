import { AppError } from "../errors";
import { config } from "../config";

export type FileKind = "docx" | "pdf" | "txt";

/** Validates size, extension AND magic bytes (extension alone is spoofable). */
export function detectFileKind(filename: string, data: Buffer): FileKind {
  if (data.length === 0) throw new AppError("The file is empty");
  if (data.length > config.limits.maxUploadBytes) throw new AppError("File is too large (max 10 MB)");
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "pdf") {
    if (data.subarray(0, 5).toString("latin1") !== "%PDF-") throw new AppError("This file is not a valid PDF");
    return "pdf";
  }
  if (ext === "docx") {
    if (data[0] !== 0x50 || data[1] !== 0x4b) throw new AppError("This file is not a valid DOCX");
    return "docx";
  }
  if (ext === "txt" || ext === "md") {
    if (data.subarray(0, 4096).includes(0)) throw new AppError("This file does not look like plain text");
    return "txt";
  }
  throw new AppError("Unsupported file type. Upload DOCX, PDF or TXT.");
}

export function mimeFor(kind: FileKind) {
  return kind === "pdf" ? "application/pdf" : kind === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "text/plain";
}
