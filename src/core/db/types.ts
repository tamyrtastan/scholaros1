/**
 * Row types. Mirrors supabase/migrations/0001_init.sql.
 * Shared-core tables first, then PaperFix module tables. GrantPilot tables will be added in their own section.
 */
export type Id = string;
interface Base {
  id: Id;
  created_at: string;
}

// ---- shared core ----
export interface ProfileRow extends Base {
  // id == auth.users.id (Supabase Auth)
  display_name: string;
  institution: string | null;
  research_interests: string[]; // reserved for GrantPilot matching
  locale: string;
}
export type PlanId = "free" | "single" | "pro" | "lab";
export interface SubscriptionRow extends Base {
  user_id: Id;
  plan: PlanId;
  status: "active" | "canceled" | "past_due";
  provider: string;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  project_credits: number; // remaining paid projects (single plan)
  current_period_end: string | null;
}
export interface UsageEventRow extends Base {
  user_id: Id;
  project_id: Id | null;
  plan: PlanId; // plan in force when the event happened
  kind: string; // e.g. ai_analysis, ai_cache_hit
  input_tokens: number;
  output_tokens: number;
  meta: Record<string, unknown>;
}

// ---- PaperFix ----
export type ProjectStatus = "draft" | "analyzed" | "responded" | "exported";
export interface ProjectRow extends Base {
  user_id: Id;
  title: string;
  journal_name: string | null;
  status: ProjectStatus;
  is_demo: boolean;
  updated_at: string;
}
export type DocumentType = "manuscript" | "reviewer_comments" | "guidelines";
export interface DocumentRow extends Base {
  project_id: Id;
  type: DocumentType;
  original_filename: string;
  storage_path: string | null;
  extracted_text: string;
  structure: unknown; // ParsedSection[] with confidence; see documents/sections.ts
}
export interface ReviewerRow extends Base {
  project_id: Id;
  label: string; // "Reviewer 1"
  position: number;
}
export type CommentStatus = "open" | "needs_author_input" | "ready" | "resolved";
export interface ReviewerCommentRow extends Base {
  project_id: Id;
  reviewer_id: Id;
  comment_number: number;
  original_comment: string;
  category: string | null;
  status: CommentStatus;
}
export interface CommentAnalysisRow extends Base {
  reviewer_comment_id: Id;
  project_id: Id;
  manuscript_section: string;
  issue_summary: string;
  requested_action: string;
  evidence_from_manuscript: string[];
  missing_information: string[];
  suggested_revision: string;
  suggested_response: string;
  confidence: number;
  author_input_required: boolean;
  relevant_sections: string[];
  input_hash: string; // cache key: same inputs => reuse
  provider: string;
}
export interface AuthorInputRow extends Base {
  reviewer_comment_id: Id;
  project_id: Id;
  content: string;
}
export type AuthorDecision = "pending" | "accepted" | "edited" | "rejected";
export interface RevisionItemRow extends Base {
  reviewer_comment_id: Id;
  project_id: Id;
  original_text: string;
  proposed_text: string;
  author_decision: AuthorDecision;
  location: string;
}
export interface ResponseEntryRow extends Base {
  reviewer_comment_id: Id;
  project_id: Id;
  author_response: string;
  change_summary: string;
  manuscript_location: string;
  edited_by_author: boolean;
}

export interface Tables {
  profiles: ProfileRow;
  subscriptions: SubscriptionRow;
  usage_events: UsageEventRow;
  projects: ProjectRow;
  documents: DocumentRow;
  reviewers: ReviewerRow;
  reviewer_comments: ReviewerCommentRow;
  comment_analyses: CommentAnalysisRow;
  author_inputs: AuthorInputRow;
  revision_items: RevisionItemRow;
  response_entries: ResponseEntryRow;
}
export type TableName = keyof Tables;
