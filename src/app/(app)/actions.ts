"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { getAi } from "@/core/ai";
import { getStorage, sanitizeFilename } from "@/core/storage";
import { detectFileKind, mimeFor } from "@/core/documents/files";
import { extractText } from "@/core/documents/extract";
import { rateLimit } from "@/core/ratelimit";
import { AppError } from "@/core/errors";
import { config } from "@/core/config";
import { track } from "@/core/analytics";
import { getBilling } from "@/core/billing/provider";
import type { AuthorDecision, CommentStatus, PlanId } from "@/core/db/types";
import { fail } from "@/lib/flash";
import { createDemoProject } from "@/modules/paperfix/demo";
import { mockProvider } from "@/modules/paperfix/mock-ai";
import { decisionSchema, statusSchema } from "@/modules/paperfix/schemas";
import * as pf from "@/modules/paperfix/service";
import type { FileInput } from "@/modules/paperfix/service";

/** Redirect after a mutation, first invalidating the client router cache so the page shows fresh data. */
function go(to: string): never {
  revalidatePath("/", "layout");
  redirect(to);
}

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** Only same-site relative paths are allowed as redirect targets. */
function backTo(f: FormData, fallback: string) {
  const n = str(f, "next");
  return n.startsWith("/") && !n.startsWith("//") ? n : fallback;
}

function throttle(userId: string, kind: string, limit = 12) {
  if (!rateLimit(`${kind}:${userId}`, limit, 60_000)) throw new AppError("You are doing that too quickly. Please wait a moment.", 429);
}

interface Upload {
  input: FileInput;
  buffer: Buffer | null;
  contentType: string;
}

async function readUpload(f: FormData, fileKey: string, textKey: string, prefix: string, userId: string, projectId: string, pastedName: string): Promise<Upload | null> {
  const file = f.get(fileKey);
  if (file instanceof File && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const kind = detectFileKind(file.name, buffer);
    const text = await extractText(kind, buffer);
    return {
      input: { filename: sanitizeFilename(file.name), text, storagePath: `${userId}/${projectId}/${prefix}-${sanitizeFilename(file.name)}` },
      buffer,
      contentType: mimeFor(kind),
    };
  }
  const pasted = str(f, textKey);
  if (!pasted) return null;
  if (pasted.length > config.limits.maxPastedChars) throw new AppError("Pasted text is too long");
  return { input: { filename: pastedName, text: pasted, storagePath: null }, buffer: null, contentType: "text/plain" };
}

export async function createProjectAction(form: FormData) {
  const user = await requireUser();
  let id = "";
  try {
    throttle(user.id, "create", 6);
    id = randomUUID();
    const db = getDb();
    const manuscript = await readUpload(form, "manuscript_file", "manuscript_text", "manuscript", user.id, id, "pasted-manuscript.txt");
    const comments = await readUpload(form, "comments_file", "comments_text", "reviews", user.id, id, "pasted-reviewer-comments.txt");
    const guidelines = await readUpload(form, "guidelines_file", "guidelines_text", "guidelines", user.id, id, "pasted-guidelines.txt");
    if (!manuscript) throw new AppError("Please upload your manuscript or paste its text");
    if (!comments) throw new AppError("Please add the reviewer comments");

    const project = await pf.createProject(db, user.id, {
      id, title: str(form, "title"), journalName: str(form, "journal"),
      manuscript: manuscript.input, reviewerComments: comments.input, guidelines: guidelines?.input ?? null,
    });
    try {
      const storage = getStorage();
      for (const u of [manuscript, comments, guidelines]) {
        if (u?.buffer && u.input.storagePath) await storage.put(u.input.storagePath, u.buffer, u.contentType);
      }
    } catch (e) {
      // Roll back: the DB rows must go even if storage is what failed. File cleanup is best effort.
      await pf.deleteProjectRows(db, user.id, project.id);
      await getStorage().removePrefix(`${user.id}/${project.id}`).catch(() => console.error("[storage] cleanup after failed upload did not complete"));
      throw e;
    }
    track("manuscript_uploaded", user.id, { via: manuscript.buffer ? "file" : "paste" });
  } catch (e) {
    fail("/projects/new", e);
  }
  go(`/projects/${id}`);
}

export async function createDemoAction() {
  const user = await requireUser();
  let id = "";
  try {
    throttle(user.id, "demo", 3);
    const db = getDb();
    const project = await createDemoProject(db, user.id);
    id = project.id;
    await pf.analyzeProject(db, mockProvider, user.id, id); // demo always uses the offline analyser: no AI cost
    await pf.generateResponses(db, user.id, id);
  } catch (e) {
    fail("/dashboard", e);
  }
  go(`/projects/${id}/workspace`);
}

export async function analyzeAction(form: FormData) {
  const user = await requireUser();
  const pid = str(form, "projectId");
  const back = backTo(form, `/projects/${pid}/analysis`);
  let msg = "";
  try {
    throttle(user.id, "analyze", 6);
    const db = getDb();
    const project = await pf.getOwnedProject(db, user.id, pid);
    const ai = project.is_demo ? mockProvider : getAi(mockProvider);
    const r = await pf.analyzeProject(db, ai, user.id, pid, { force: str(form, "force") === "1" });
    msg = `Analysed ${r.analyzed} comment(s), ${r.cached} unchanged (reused)${r.failed ? `, ${r.failed} failed. Run again to retry.` : "."}`;
  } catch (e) {
    fail(back, e);
  }
  go(`${back}${back.includes("?") ? "&" : "?"}ok=${encodeURIComponent(msg)}`);
}

export async function authorInputAction(form: FormData) {
  const user = await requireUser();
  const pid = str(form, "projectId");
  const back = backTo(form, `/projects/${pid}/workspace`);
  try {
    throttle(user.id, "input", 20);
    const db = getDb();
    const project = await pf.getOwnedProject(db, user.id, pid);
    const ai = project.is_demo ? mockProvider : getAi(mockProvider);
    await pf.submitAuthorInput(db, ai, user.id, pid, str(form, "commentId"), str(form, "content"));
  } catch (e) {
    fail(back, e);
  }
  go(back);
}

export async function decisionAction(form: FormData) {
  const user = await requireUser();
  const back = backTo(form, "/dashboard");
  try {
    const decision = decisionSchema.parse(str(form, "decision")) as AuthorDecision;
    await pf.setRevisionDecision(getDb(), user.id, str(form, "revisionId"), decision, str(form, "text") || undefined);
  } catch (e) {
    fail(back, e);
  }
  go(back);
}

export async function statusAction(form: FormData) {
  const user = await requireUser();
  const back = backTo(form, "/dashboard");
  try {
    const status = statusSchema.parse(str(form, "status")) as CommentStatus;
    await pf.setCommentStatus(getDb(), user.id, str(form, "commentId"), status);
  } catch (e) {
    fail(back, e);
  }
  go(back);
}

export async function generateResponsesAction(form: FormData) {
  const user = await requireUser();
  const pid = str(form, "projectId");
  try {
    await pf.generateResponses(getDb(), user.id, pid);
  } catch (e) {
    fail(`/projects/${pid}/response`, e);
  }
  go(`/projects/${pid}/response?ok=${encodeURIComponent("Response entries updated. Entries you edited by hand were kept.")}`);
}

export async function saveResponseAction(form: FormData) {
  const user = await requireUser();
  const back = backTo(form, "/dashboard");
  try {
    await pf.updateResponseEntry(getDb(), user.id, str(form, "entryId"), {
      author_response: String(form.get("author_response") ?? ""),
      change_summary: String(form.get("change_summary") ?? ""),
      manuscript_location: String(form.get("manuscript_location") ?? ""),
    });
  } catch (e) {
    fail(back, e);
  }
  go(back);
}

export async function deleteProjectAction(form: FormData) {
  const user = await requireUser();
  const pid = str(form, "projectId");
  try {
    if (str(form, "confirm") !== "DELETE") throw new AppError('Type DELETE to confirm');
    await pf.deleteProject(getDb(), getStorage(), user.id, pid);
  } catch (e) {
    fail(`/projects/${pid}`, e);
  }
  go("/dashboard?ok=" + encodeURIComponent("Project and its files were deleted."));
}

export async function upgradeAction(form: FormData) {
  const user = await requireUser();
  const plan = str(form, "plan") as PlanId;
  let url = "";
  try {
    if (!["single", "pro", "lab"].includes(plan)) throw new AppError("Unknown plan");
    track("upgrade_clicked", user.id, { plan });
    url = (await getBilling().startCheckout(getDb(), user.id, plan as Exclude<PlanId, "free">)).url;
  } catch (e) {
    fail("/account", e);
  }
  go(url);
}
