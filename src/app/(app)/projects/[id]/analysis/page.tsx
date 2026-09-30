import type { Metadata } from "next";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { getProjectBundle } from "@/modules/paperfix/service";
import { analyzeAction } from "../../../actions";
import { AuthorInputBanner, Badge, Button, Card, Flash, statusLabel, statusTone } from "@/components/ui";

export const metadata: Metadata = { title: "Analysis" };

export default async function Analysis({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const b = await getProjectBundle(getDb(), user.id, id);
  const needInput = b.analyses.filter((a) => a.author_input_required).length;
  const provider = b.analyses[0]?.provider;

  return (
    <>
      <Flash {...sp} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {b.analyses.length} of {b.comments.length} comments analysed
          {needInput > 0 && <> · <span className="font-medium text-alert">{needInput} need author input</span></>}
          {provider === "mock" && <> · <Badge tone="warn">Offline heuristic analysis</Badge></>}
        </p>
        <form action={analyzeAction}>
          <input type="hidden" name="projectId" value={id} />
          <input type="hidden" name="next" value={`/projects/${id}/analysis`} />
          <Button variant="secondary" type="submit">{b.analyses.length ? "Re-run (reuses unchanged)" : "Analyse comments"}</Button>
        </form>
      </div>

      {b.analyses.length === 0 && <Card className="text-center text-muted">No analysis yet. Run the analysis to map each comment to your manuscript.</Card>}

      <div className="space-y-5">
        {b.reviewers.map((r) =>
          b.comments.filter((c) => c.reviewer_id === r.id).map((c) => {
            const a = b.analyses.find((x) => x.reviewer_comment_id === c.id);
            if (!a) return null;
            return (
              <Card key={c.id} id={`c-${c.id}`} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{r.label} · Comment {c.comment_number}</h3>
                  {c.category && <Badge tone="brand">{c.category.replace("_", " / ")}</Badge>}
                  <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
                  <span className="ml-auto text-xs text-muted">Confidence {Math.round(a.confidence * 100)}%</span>
                </div>
                <blockquote className="border-l-2 border-brand pl-3 font-serif italic">{c.original_comment}</blockquote>
                <dl className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="font-medium">Issue identified</dt><dd className="text-muted">{a.issue_summary}</dd></div>
                  <div><dt className="font-medium">Requested action</dt><dd className="text-muted">{a.requested_action}</dd></div>
                  <div><dt className="font-medium">Relevant sections</dt><dd className="text-muted">{a.relevant_sections.join(", ") || "Not identified"}</dd></div>
                  <div>
                    <dt className="font-medium">Evidence from your manuscript</dt>
                    <dd className="text-muted">{a.evidence_from_manuscript.length ? a.evidence_from_manuscript.map((e, i) => <p key={i} className="mb-1">“{e}”</p>) : "No directly relevant passage found."}</dd>
                  </div>
                </dl>
                {a.author_input_required && (
                  <AuthorInputBanner>
                    <p>The manuscript does not contain the information needed to answer this comment:</p>
                    <ul className="mt-1 list-disc pl-5">{a.missing_information.map((m) => <li key={m}>{m}</li>)}</ul>
                  </AuthorInputBanner>
                )}
              </Card>
            );
          }),
        )}
      </div>
    </>
  );
}
