import type { Metadata } from "next";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { getProjectBundle } from "@/modules/paperfix/service";
import { buildLetterModel } from "@/modules/paperfix/export";
import { generateResponsesAction, saveResponseAction } from "../../../actions";
import { Badge, Button, Card, Flash, Input, Textarea } from "@/components/ui";

export const metadata: Metadata = { title: "Response to Reviewers" };

export default async function Response({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const b = await getProjectBundle(getDb(), user.id, id);
  const letter = buildLetterModel(b);
  const here = `/projects/${id}/response`;

  return (
    <>
      <Flash {...sp} />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">
          Every field is editable. Regenerating refreshes entries from your latest decisions but never overwrites entries you edited.
        </p>
        <form action={generateResponsesAction}>
          <input type="hidden" name="projectId" value={id} />
          <Button variant="secondary" type="submit">{b.responses.length ? "Refresh from workspace" : "Generate response"}</Button>
        </form>
      </div>
      {letter.pendingCount > 0 && (
        <div className="mb-5 rounded-md border border-alert/30 bg-alert-soft p-3 text-sm text-alert">
          <b>AUTHOR INPUT REQUIRED</b>: {letter.pendingCount} field(s) still contain placeholders. Resolve them in the workspace or edit below.
        </div>
      )}
      {b.responses.length === 0 && <Card className="mb-5 text-center text-muted">No saved response yet. A preview is shown below; click “Generate response” to save it and start editing.</Card>}

      <div className="space-y-8">
        {b.reviewers.map((r) => (
          <section key={r.id}>
            <h2 className="mb-3 text-xl font-semibold">{r.label}</h2>
            <div className="space-y-4">
              {b.comments.filter((c) => c.reviewer_id === r.id).map((c) => {
                const entry = b.responses.find((x) => x.reviewer_comment_id === c.id);
                const item = letter.reviewers.find((x) => x.label === r.label)!.items.find((i) => i.number === c.comment_number)!;
                return (
                  <Card key={c.id} id={`c-${c.id}`} className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">Comment {c.comment_number}</h3>
                      {entry?.edited_by_author && <Badge tone="ok">Edited by you</Badge>}
                    </div>
                    <p className="rounded bg-paper p-3 text-sm">{c.original_comment}</p>
                    {entry ? (
                      <form action={saveResponseAction} className="space-y-3">
                        <input type="hidden" name="entryId" value={entry.id} />
                        <input type="hidden" name="next" value={`${here}#c-${c.id}`} />
                        <div><label className="mb-1 block text-sm font-medium" htmlFor={`r-${c.id}`}>Response</label><Textarea id={`r-${c.id}`} name="author_response" rows={4} defaultValue={entry.author_response} /></div>
                        <div><label className="mb-1 block text-sm font-medium" htmlFor={`s-${c.id}`}>Changes made</label><Textarea id={`s-${c.id}`} name="change_summary" rows={4} defaultValue={entry.change_summary} /></div>
                        <div><label className="mb-1 block text-sm font-medium" htmlFor={`l-${c.id}`}>Location</label><Input id={`l-${c.id}`} name="manuscript_location" defaultValue={entry.manuscript_location} /></div>
                        <Button type="submit" variant="secondary">Save</Button>
                      </form>
                    ) : (
                      <div className="space-y-2 text-sm text-muted">
                        <p><b className="text-ink">Response:</b> {item.response}</p>
                        <p className="whitespace-pre-wrap"><b className="text-ink">Changes made:</b> {item.changes}</p>
                        <p><b className="text-ink">Location:</b> {item.location}</p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
