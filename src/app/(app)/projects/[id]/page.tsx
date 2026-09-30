import type { Metadata } from "next";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import type { ParsedSection } from "@/core/documents/sections";
import { getProjectBundle } from "@/modules/paperfix/service";
import { analyzeAction } from "../../actions";
import { Badge, Button, Card, Flash } from "@/components/ui";

export const metadata: Metadata = { title: "Project overview" };

export default async function Overview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const [{ id }, sp, user] = await Promise.all([params, searchParams, requireUser()]);
  const b = await getProjectBundle(getDb(), user.id, id);
  const ms = b.documents.find((d) => d.type === "manuscript");
  const sections = (ms?.structure as ParsedSection[] | null) ?? [];
  const analysed = b.analyses.length;
  const low = sections.length === 1 && sections[0].confidence < 0.5;

  return (
    <>
      <Flash {...sp} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <h2 className="text-lg font-semibold">Reviewer comments</h2>
            {b.reviewers.map((r) => (
              <div key={r.id} className="mt-4">
                <h3 className="text-sm font-semibold text-brand">{r.label}</h3>
                <ol className="mt-2 space-y-2 text-sm">
                  {b.comments.filter((c) => c.reviewer_id === r.id).map((c) => (
                    <li key={c.id} className="rounded-md bg-paper p-3"><span className="font-medium">{c.comment_number}.</span> {c.original_comment}</li>
                  ))}
                </ol>
              </div>
            ))}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <h2 className="text-lg font-semibold">Next step</h2>
            <p className="mt-1 text-sm text-muted">
              {analysed ? `${analysed} of ${b.comments.length} comments analysed.` : `${b.comments.length} comments ready to analyse.`} Unchanged comments are reused, not re-processed.
            </p>
            <form action={analyzeAction} className="mt-3">
              <input type="hidden" name="projectId" value={id} />
              <input type="hidden" name="next" value={`/projects/${id}/analysis`} />
              <Button type="submit" className="w-full">{analysed ? "Re-run analysis" : "Analyse comments"}</Button>
            </form>
          </Card>
          <Card>
            <h2 className="text-lg font-semibold">Manuscript structure</h2>
            <p className="mt-1 text-xs text-muted">Detected automatically. This is a best guess and may be imperfect.</p>
            {low && <p className="mt-2 rounded bg-warn-soft p-2 text-xs text-warn">No standard section headings were found; the whole text will be searched instead. Put headings like “Methods” on their own lines for better mapping.</p>}
            <ul className="mt-3 space-y-1.5 text-sm">
              {sections.map((s) => (
                <li key={s.name} className="flex items-center justify-between">
                  <span>{s.name}</span>
                  <Badge tone={s.confidence >= 0.8 ? "ok" : s.confidence >= 0.5 ? "warn" : "neutral"}>{Math.round(s.confidence * 100)}%</Badge>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
