import type { Metadata } from "next";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { getProjectBundle } from "@/modules/paperfix/service";
import { CATEGORIES } from "@/modules/paperfix/schemas";
import { authorInputAction, decisionAction, statusAction } from "../../../actions";
import { AuthorInputBanner, Badge, Button, ButtonLink, Card, Flash, Select, Textarea, statusLabel, statusTone } from "@/components/ui";

export const metadata: Metadata = { title: "Revision workspace" };
type SP = { error?: string; ok?: string; reviewer?: string; category?: string; status?: string };

export default async function Workspace({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const b = await getProjectBundle(getDb(), user.id, id);
  const qs = new URLSearchParams();
  for (const k of ["reviewer", "category", "status"] as const) if (sp[k]) qs.set(k, sp[k]!);
  const here = `/projects/${id}/workspace${qs.size ? `?${qs}` : ""}`;

  const visible = b.comments.filter(
    (c) => (!sp.reviewer || c.reviewer_id === sp.reviewer) && (!sp.category || c.category === sp.category) && (!sp.status || c.status === sp.status),
  );
  const counts = Object.fromEntries((["open", "needs_author_input", "ready", "resolved"] as const).map((s) => [s, b.comments.filter((c) => c.status === s).length]));

  return (
    <>
      <Flash error={sp.error} ok={sp.ok} />
      <div className="mb-4 flex flex-wrap gap-2 text-sm">
        {(["open", "needs_author_input", "ready", "resolved"] as const).map((s) => (
          <Badge key={s} tone={statusTone[s]}>{statusLabel[s]}: {counts[s]}</Badge>
        ))}
      </div>
      <form method="get" className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-card p-3">
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-reviewer">Reviewer</label>
          <Select id="f-reviewer" name="reviewer" defaultValue={sp.reviewer ?? ""}><option value="">All</option>{b.reviewers.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}</Select></div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-category">Category</label>
          <Select id="f-category" name="category" defaultValue={sp.category ?? ""}><option value="">All</option>{CATEGORIES.map((c) => <option key={c} value={c}>{c.replace("_", " / ")}</option>)}</Select></div>
        <div><label className="mb-1 block text-xs text-muted" htmlFor="f-status">Status</label>
          <Select id="f-status" name="status" defaultValue={sp.status ?? ""}><option value="">All</option>{(["open", "needs_author_input", "ready", "resolved"] as const).map((s) => <option key={s} value={s}>{statusLabel[s]}</option>)}</Select></div>
        <Button type="submit" variant="secondary">Filter</Button>
        <ButtonLink href={`/projects/${id}/workspace`} variant="ghost">Clear</ButtonLink>
      </form>

      {b.analyses.length === 0 && <Card className="text-center text-muted">Run the analysis first to get proposed revisions.</Card>}
      {visible.length === 0 && b.analyses.length > 0 && <Card className="text-center text-muted">No comments match these filters.</Card>}

      <div className="space-y-6">
        {visible.map((c) => {
          const a = b.analyses.find((x) => x.reviewer_comment_id === c.id);
          const rev = b.revisions.find((x) => x.reviewer_comment_id === c.id);
          const reviewer = b.reviewers.find((r) => r.id === c.reviewer_id);
          const inputs = b.authorInputs.filter((x) => x.reviewer_comment_id === c.id);
          if (!a || !rev) return null;
          const next = `${here}#c-${c.id}`;
          return (
            <Card key={c.id} id={`c-${c.id}`} className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold">{reviewer?.label} · Comment {c.comment_number}</h3>
                {c.category && <Badge tone="brand">{c.category.replace("_", " / ")}</Badge>}
                <Badge tone={statusTone[c.status]}>{statusLabel[c.status]}</Badge>
                {rev.author_decision !== "pending" && <Badge tone={rev.author_decision === "rejected" ? "neutral" : "ok"}>{rev.author_decision}</Badge>}
              </div>

              <blockquote className="border-l-2 border-brand pl-3 font-serif italic">{c.original_comment}</blockquote>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 text-sm">
                  <div><p className="font-medium">Issue identified</p><p className="text-muted">{a.issue_summary}</p></div>
                  <div><p className="font-medium">Relevant section</p><p className="text-muted">{a.manuscript_section || "Not identified"}</p></div>
                  <div>
                    <p className="font-medium">Current manuscript text</p>
                    {rev.original_text ? <p className="rounded bg-paper p-2 text-muted">“{rev.original_text}”</p> : <p className="text-muted">No directly relevant passage identified.</p>}
                  </div>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="font-medium">Proposed change</p>
                    <p className="whitespace-pre-wrap rounded bg-brand-soft p-2">{rev.proposed_text}</p>
                  </div>
                </div>
              </div>

              {a.author_input_required && (
                <AuthorInputBanner>
                  <p>Please provide the following. PaperFix will not guess:</p>
                  <ul className="mt-1 list-disc pl-5">{a.missing_information.map((m) => <li key={m}>{m}</li>)}</ul>
                </AuthorInputBanner>
              )}

              {(a.author_input_required || inputs.length > 0) && (
                <form action={authorInputAction} className="space-y-2">
                  <input type="hidden" name="projectId" value={id} />
                  <input type="hidden" name="commentId" value={c.id} />
                  <input type="hidden" name="next" value={next} />
                  {inputs.map((i) => <p key={i.id} className="rounded bg-ok-soft p-2 text-sm"><b>Your input:</b> {i.content}</p>)}
                  <label htmlFor={`in-${c.id}`} className="block text-sm font-medium">{inputs.length ? "Add more information" : "Your information"}</label>
                  <Textarea id={`in-${c.id}`} name="content" rows={3} required placeholder="Write the real details from your study. They are used as written." />
                  <Button type="submit" variant="secondary">Submit &amp; re-analyse this comment</Button>
                </form>
              )}

              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                {[["accepted", "Accept"], ["rejected", "Reject"]].map(([d, label]) => (
                  <form key={d} action={decisionAction}>
                    <input type="hidden" name="revisionId" value={rev.id} /><input type="hidden" name="decision" value={d} /><input type="hidden" name="next" value={next} />
                    <Button type="submit" variant={d === "accepted" ? "primary" : "secondary"}>{label}</Button>
                  </form>
                ))}
                <details className="group">
                  <summary className="inline-flex cursor-pointer list-none items-center rounded-md border border-line bg-card px-4 py-2 text-sm font-medium hover:bg-brand-soft">Edit</summary>
                  <form action={decisionAction} className="absolute z-10 mt-2 w-[min(32rem,calc(100vw-3rem))] space-y-2 rounded-lg border border-line bg-card p-3 shadow-lg">
                    <input type="hidden" name="revisionId" value={rev.id} /><input type="hidden" name="decision" value="edited" /><input type="hidden" name="next" value={next} />
                    <Textarea name="text" rows={6} defaultValue={rev.proposed_text} aria-label="Edited proposed change" />
                    <Button type="submit">Save edit</Button>
                  </form>
                </details>
                <form action={statusAction} className="ml-auto">
                  <input type="hidden" name="commentId" value={c.id} /><input type="hidden" name="next" value={next} />
                  <input type="hidden" name="status" value={c.status === "resolved" ? "ready" : "resolved"} />
                  <Button type="submit" variant={c.status === "resolved" ? "ghost" : "secondary"}>{c.status === "resolved" ? "Reopen" : "Resolve"}</Button>
                </form>
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
