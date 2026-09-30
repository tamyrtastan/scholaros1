import { createHash } from "node:crypto";
import type { Db } from "@/core/db/store";
import type {
  AuthorDecision, CommentAnalysisRow, CommentStatus, DocumentRow, ProjectRow, ResponseEntryRow,
  ReviewerCommentRow, ReviewerRow, RevisionItemRow, AuthorInputRow,
} from "@/core/db/types";
import type { AiProvider } from "@/core/ai/provider";
import { completeStructured } from "@/core/ai/structured";
import { config } from "@/core/config";
import { AppError, ForbiddenError, NotFoundError } from "@/core/errors";
import { assertCanCreateProject, assertWithinTokenBudget, getPlan, recordUsage } from "@/core/billing/entitlements";
import { parseReviewerComments } from "@/core/documents/reviewer-comments";
import { detectSections, type ParsedSection } from "@/core/documents/sections";
import type { Storage } from "@/core/storage";
import { track } from "@/core/analytics";
import { selectContext } from "./context";
import { enforceIntegrity } from "./guardrails";
import { buildUserPrompt, PROMPT_VERSION, SYSTEM_PROMPT } from "./prompt";
import { analysisOutputSchema, newProjectSchema } from "./schemas";

// ---------- authorization ----------

/** Single choke point for per-user project access. Every project-scoped operation goes through it. */
export async function getOwnedProject(db: Db, userId: string, projectId: string): Promise<ProjectRow> {
  const project = await db.get("projects", projectId);
  if (!project) throw new NotFoundError("Project not found");
  if (project.user_id !== userId) throw new NotFoundError("Project not found"); // do not reveal existence
  return project;
}

async function touch(db: Db, projectId: string, patch: Partial<ProjectRow> = {}) {
  await db.update("projects", projectId, { updated_at: new Date().toISOString(), ...patch });
}

// ---------- project creation ----------

export interface FileInput {
  filename: string;
  text: string;
  storagePath: string | null;
}
export interface CreateProjectInput {
  id?: string;
  title: string;
  journalName?: string;
  manuscript: FileInput;
  reviewerComments: FileInput; // raw text containing all reviewers
  guidelines?: FileInput | null;
  isDemo?: boolean;
}

export async function createProject(db: Db, userId: string, input: CreateProjectInput): Promise<ProjectRow> {
  const parsed = newProjectSchema.safeParse({ title: input.title, journal_name: input.journalName });
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  if (!input.manuscript.text.trim()) throw new AppError("Please provide your manuscript (upload a file or paste the text)");
  const reviewers = parseReviewerComments(input.reviewerComments.text);
  const total = reviewers.reduce((n, r) => n + r.comments.length, 0);
  if (total === 0) throw new AppError("Please add at least one reviewer comment");
  if (reviewers.some((r) => r.comments.some((c) => c.length > config.limits.maxCommentChars))) {
    throw new AppError(`A single reviewer comment is too long (max ${config.limits.maxCommentChars} characters)`);
  }

  if (!input.isDemo) {
    await assertCanCreateProject(db, userId);
    const plan = await getPlan(db, userId);
    if (total > plan.limits.maxCommentsPerProject) {
      throw new AppError(`Your ${plan.name} plan supports up to ${plan.limits.maxCommentsPerProject} reviewer comments per project (you have ${total}).`, 402);
    }
    if (input.manuscript.text.length > plan.limits.maxManuscriptChars) {
      throw new AppError(`This manuscript is longer than your ${plan.name} plan supports.`, 402);
    }
  }

  const project = await db.insert("projects", {
    ...(input.id ? { id: input.id } : {}),
    user_id: userId,
    title: parsed.data.title,
    journal_name: parsed.data.journal_name || null,
    status: "draft",
    is_demo: !!input.isDemo,
    updated_at: new Date().toISOString(),
  });

  const sections = detectSections(input.manuscript.text);
  await db.insert("documents", {
    project_id: project.id, type: "manuscript", original_filename: input.manuscript.filename,
    storage_path: input.manuscript.storagePath, extracted_text: input.manuscript.text, structure: sections,
  });
  await db.insert("documents", {
    project_id: project.id, type: "reviewer_comments", original_filename: input.reviewerComments.filename,
    storage_path: input.reviewerComments.storagePath, extracted_text: input.reviewerComments.text, structure: null,
  });
  if (input.guidelines?.text.trim()) {
    await db.insert("documents", {
      project_id: project.id, type: "guidelines", original_filename: input.guidelines.filename,
      storage_path: input.guidelines.storagePath, extracted_text: input.guidelines.text, structure: null,
    });
  }
  for (const [ri, r] of reviewers.entries()) {
    const reviewer = await db.insert("reviewers", { project_id: project.id, label: r.label, position: ri + 1 });
    for (const [ci, text] of r.comments.entries()) {
      await db.insert("reviewer_comments", {
        project_id: project.id, reviewer_id: reviewer.id, comment_number: ci + 1,
        original_comment: text, category: null, status: "open",
      });
    }
  }
  track("project_created", userId, { comments: total, demo: !!input.isDemo });
  return project;
}

// ---------- reading ----------

export interface ProjectBundle {
  project: ProjectRow;
  documents: DocumentRow[];
  reviewers: ReviewerRow[];
  comments: ReviewerCommentRow[];
  analyses: CommentAnalysisRow[];
  authorInputs: AuthorInputRow[];
  revisions: RevisionItemRow[];
  responses: ResponseEntryRow[];
}

export async function getProjectBundle(db: Db, userId: string, projectId: string): Promise<ProjectBundle> {
  const project = await getOwnedProject(db, userId, projectId);
  const by = { project_id: projectId };
  const [documents, reviewers, comments, analyses, authorInputs, revisions, responses] = await Promise.all([
    db.find("documents", by), db.find("reviewers", by), db.find("reviewer_comments", by), db.find("comment_analyses", by),
    db.find("author_inputs", by), db.find("revision_items", by), db.find("response_entries", by),
  ]);
  reviewers.sort((a, b) => a.position - b.position);
  const pos = new Map(reviewers.map((r) => [r.id, r.position]));
  comments.sort((a, b) => (pos.get(a.reviewer_id) ?? 0) - (pos.get(b.reviewer_id) ?? 0) || a.comment_number - b.comment_number);
  return { project, documents, reviewers, comments, analyses, authorInputs, revisions, responses };
}

export const listProjects = async (db: Db, userId: string) =>
  (await db.find("projects", { user_id: userId })).sort((a, b) => b.updated_at.localeCompare(a.updated_at));

// ---------- analysis ----------

const sha = (...parts: string[]) => createHash("sha256").update(parts.join("\u0000")).digest("hex");

export interface AnalyzeResult {
  analyzed: number;
  cached: number;
  failed: number;
}

async function analyzeOne(
  db: Db, ai: AiProvider, userId: string, bundle: ProjectBundle, comment: ReviewerCommentRow, force: boolean,
): Promise<"analyzed" | "cached"> {
  const manuscript = bundle.documents.find((d) => d.type === "manuscript");
  if (!manuscript) throw new AppError("This project has no manuscript");
  const sections = (manuscript.structure as ParsedSection[] | null) ?? detectSections(manuscript.extracted_text);
  const guidelines = bundle.documents.find((d) => d.type === "guidelines")?.extracted_text.slice(0, 3000);
  const authorInput = bundle.authorInputs
    .filter((a) => a.reviewer_comment_id === comment.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((a) => a.content).join("\n\n");

  const ctx = selectContext(sections, comment.original_comment, config.ai.maxInputChars);
  const hash = sha(PROMPT_VERSION, ai.model, comment.original_comment, ctx.excerpt, guidelines ?? "", authorInput);
  const existing = bundle.analyses.find((a) => a.reviewer_comment_id === comment.id);

  if (existing && existing.input_hash === hash && !force) {
    await recordUsage(db, { userId, projectId: comment.project_id, kind: "ai_cache_hit" });
    return "cached";
  }
  if (ai.name !== "mock") await assertWithinTokenBudget(db, userId);

  const res = await completeStructured(
    ai, analysisOutputSchema,
    { system: SYSTEM_PROMPT, user: buildUserPrompt({ commentId: comment.id, comment: comment.original_comment, excerpt: ctx.excerpt, guidelines, authorInput }), maxTokens: config.ai.maxOutputTokens },
    config.ai.maxRetries,
  );
  await recordUsage(db, {
    userId, projectId: comment.project_id, kind: "ai_analysis",
    inputTokens: res.inputTokens, outputTokens: res.outputTokens, meta: { provider: ai.name, model: ai.model, attempts: res.attempts },
  });
  const out = enforceIntegrity({ ...res.data, comment_id: comment.id }, manuscript.extracted_text);

  const row = {
    reviewer_comment_id: comment.id, project_id: comment.project_id,
    manuscript_section: out.relevant_manuscript_sections[0] ?? ctx.sectionNames[0] ?? "",
    issue_summary: out.issue_summary, requested_action: out.requested_action,
    evidence_from_manuscript: out.evidence_from_manuscript, missing_information: out.missing_information,
    suggested_revision: out.suggested_revision, suggested_response: out.suggested_response_to_reviewer,
    confidence: out.confidence, author_input_required: out.author_input_required,
    relevant_sections: out.relevant_manuscript_sections, input_hash: hash, provider: ai.name,
  };
  if (existing) await db.update("comment_analyses", existing.id, row);
  else await db.insert("comment_analyses", row);

  const status: CommentStatus = comment.status === "resolved" ? "resolved" : out.author_input_required ? "needs_author_input" : "ready";
  await db.update("reviewer_comments", comment.id, { category: out.category, status });

  const rev = bundle.revisions.find((r) => r.reviewer_comment_id === comment.id);
  const revRow = { original_text: out.evidence_from_manuscript[0] ?? "", proposed_text: out.suggested_revision, location: row.manuscript_section, author_decision: "pending" as AuthorDecision };
  if (rev) await db.update("revision_items", rev.id, revRow);
  else await db.insert("revision_items", { reviewer_comment_id: comment.id, project_id: comment.project_id, ...revRow });

  if (out.author_input_required) track("author_input_required", userId, { category: out.category });
  return "analyzed";
}

/** Analyses all comments (or one). Unchanged inputs hit the cache and cost nothing. */
export async function analyzeProject(
  db: Db, ai: AiProvider, userId: string, projectId: string, opts: { onlyCommentId?: string; force?: boolean } = {},
): Promise<AnalyzeResult> {
  const bundle = await getProjectBundle(db, userId, projectId);
  const targets = bundle.comments.filter((c) => !opts.onlyCommentId || c.id === opts.onlyCommentId);
  if (opts.onlyCommentId && targets.length === 0) throw new NotFoundError("Comment not found");
  track("analysis_started", userId, { comments: targets.length });

  const result: AnalyzeResult = { analyzed: 0, cached: 0, failed: 0 };
  let next = 0;
  let fatal: unknown = null;
  const worker = async () => {
    while (next < targets.length && !fatal) {
      const c = targets[next++];
      try {
        result[await analyzeOne(db, ai, userId, bundle, c, !!opts.force)]++;
      } catch (e) {
        if (e instanceof AppError) fatal = e; // limits etc.: stop and surface
        else result.failed++;
      }
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  if (fatal && result.analyzed + result.cached === 0) throw fatal;

  await touch(db, projectId, { status: "analyzed" });
  track("analysis_completed", userId, { ...result });
  return result;
}

export async function submitAuthorInput(db: Db, ai: AiProvider, userId: string, projectId: string, commentId: string, content: string) {
  await getOwnedProject(db, userId, projectId);
  const text = content.trim();
  if (!text) throw new AppError("Please enter the missing information");
  if (text.length > config.limits.maxCommentChars) throw new AppError("That input is too long");
  const comment = await db.get("reviewer_comments", commentId);
  if (!comment || comment.project_id !== projectId) throw new NotFoundError("Comment not found");
  await db.insert("author_inputs", { reviewer_comment_id: commentId, project_id: projectId, content: text });
  return analyzeProject(db, ai, userId, projectId, { onlyCommentId: commentId });
}

// ---------- revision workspace ----------

async function ownedChild<T extends "reviewer_comments" | "revision_items" | "response_entries">(db: Db, userId: string, table: T, id: string) {
  const row = await db.get(table, id);
  if (!row) throw new NotFoundError();
  await getOwnedProject(db, userId, row.project_id);
  return row;
}

export async function setRevisionDecision(db: Db, userId: string, revisionId: string, decision: AuthorDecision, editedText?: string) {
  const rev = await ownedChild(db, userId, "revision_items", revisionId);
  const patch: Partial<RevisionItemRow> = { author_decision: decision };
  if (decision === "edited") {
    if (!editedText?.trim()) throw new AppError("Edited text cannot be empty");
    patch.proposed_text = editedText.trim();
  }
  await db.update("revision_items", revisionId, patch);
  const comment = await db.get("reviewer_comments", rev.reviewer_comment_id);
  if (comment && comment.status !== "resolved" && (decision === "accepted" || decision === "edited")) {
    const analysis = (await db.find("comment_analyses", { reviewer_comment_id: comment.id }))[0];
    const hasInput = (await db.find("author_inputs", { reviewer_comment_id: comment.id })).length > 0;
    if (!analysis?.author_input_required || hasInput) await db.update("reviewer_comments", comment.id, { status: "ready" });
  }
  await touch(db, rev.project_id);
}

export async function setCommentStatus(db: Db, userId: string, commentId: string, status: CommentStatus) {
  const c = await ownedChild(db, userId, "reviewer_comments", commentId);
  await db.update("reviewer_comments", commentId, { status });
  await touch(db, c.project_id);
  if (status === "resolved") track("revision_resolved", userId);
}

// ---------- response to reviewers ----------

export function buildResponseEntry(
  analysis: CommentAnalysisRow | undefined, revision: RevisionItemRow | undefined,
): { author_response: string; change_summary: string; manuscript_location: string } {
  const location = analysis?.manuscript_section
    ? `${analysis.manuscript_section} section (add page/line numbers)`
    : "[AUTHOR INPUT REQUIRED: manuscript location not identified]";
  if (!analysis) {
    return { author_response: "[AUTHOR INPUT REQUIRED: this comment has not been analysed yet]", change_summary: "", manuscript_location: location };
  }
  let change: string;
  switch (revision?.author_decision) {
    case "rejected":
      change = "No change made to the manuscript. [Author: explain in the response why the suggestion was not adopted.]";
      break;
    case "accepted":
    case "edited":
      change = `${analysis.manuscript_section || "Manuscript"} revised as follows:\n${revision.proposed_text}`;
      break;
    default:
      change = "[Pending: accept or edit a revision in the workspace to describe the change made.]";
  }
  return { author_response: analysis.suggested_response, change_summary: change, manuscript_location: location };
}

/** (Re)builds response entries. Entries the author edited by hand are never overwritten. */
export async function generateResponses(db: Db, userId: string, projectId: string): Promise<number> {
  const b = await getProjectBundle(db, userId, projectId);
  let n = 0;
  for (const c of b.comments) {
    const existing = b.responses.find((r) => r.reviewer_comment_id === c.id);
    if (existing?.edited_by_author) continue;
    const entry = buildResponseEntry(
      b.analyses.find((a) => a.reviewer_comment_id === c.id),
      b.revisions.find((r) => r.reviewer_comment_id === c.id),
    );
    if (existing) await db.update("response_entries", existing.id, entry);
    else await db.insert("response_entries", { reviewer_comment_id: c.id, project_id: projectId, edited_by_author: false, ...entry });
    n++;
  }
  await touch(db, projectId, { status: "responded" });
  return n;
}

export async function updateResponseEntry(
  db: Db, userId: string, entryId: string, patch: { author_response: string; change_summary: string; manuscript_location: string },
) {
  const e = await ownedChild(db, userId, "response_entries", entryId);
  await db.update("response_entries", entryId, { ...patch, edited_by_author: true });
  await touch(db, e.project_id);
}

// ---------- deletion ----------

/** Deletes the project, all derived rows and all stored files. */
export async function deleteProject(db: Db, storage: Storage, userId: string, projectId: string) {
  const project = await getOwnedProject(db, userId, projectId);
  if (project.user_id !== userId) throw new ForbiddenError();
  await storage.removePrefix(`${userId}/${projectId}`);
  for (const t of ["response_entries", "revision_items", "author_inputs", "comment_analyses", "reviewer_comments", "reviewers", "documents"] as const) {
    await db.remove(t, { project_id: projectId });
  }
  // keep usage events (cost accounting / monthly budget) but detach them from the deleted project
  for (const e of await db.find("usage_events", { project_id: projectId })) await db.update("usage_events", e.id, { project_id: null });
  await db.remove("projects", { id: projectId });
}
