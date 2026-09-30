import { z } from "zod";

export const CATEGORIES = [
  "methodology", "literature", "statistics", "presentation", "language",
  "references", "figures_tables", "ethics", "interpretation", "formatting", "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const AUTHOR_INPUT_REQUIRED = "AUTHOR INPUT REQUIRED";

/** The contract for one analysed reviewer comment. Validated for every model/mock response. */
export const analysisOutputSchema = z.object({
  comment_id: z.string().min(1),
  category: z.enum(CATEGORIES),
  issue_summary: z.string().min(1).max(1500),
  requested_action: z.string().min(1).max(1500),
  relevant_manuscript_sections: z.array(z.string().max(120)).max(8),
  evidence_from_manuscript: z.array(z.string().max(1200)).max(6),
  missing_information: z.array(z.string().max(600)).max(10),
  author_input_required: z.boolean(),
  suggested_revision: z.string().max(4000),
  suggested_response_to_reviewer: z.string().max(3000),
  confidence: z.number().min(0).max(1),
});
export type AnalysisOutput = z.infer<typeof analysisOutputSchema>;

export const newProjectSchema = z.object({
  title: z.string().trim().min(1, "Project title is required").max(200),
  journal_name: z.string().trim().max(200).optional(),
});

export const decisionSchema = z.enum(["pending", "accepted", "edited", "rejected"]);
export const statusSchema = z.enum(["open", "needs_author_input", "ready", "resolved"]);
