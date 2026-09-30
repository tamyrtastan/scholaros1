import type { Metadata } from "next";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { getProjectBundle } from "@/modules/paperfix/service";
import { buildLetterModel } from "@/modules/paperfix/export";
import { ButtonLink, Card } from "@/components/ui";

export const metadata: Metadata = { title: "Export" };

export default async function Export({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);
  const b = await getProjectBundle(getDb(), user.id, id);
  const pending = buildLetterModel(b).pendingCount;
  const items = [
    ["report", "Revision Report (DOCX)", "For you and co-authors: every comment with issue, evidence, missing information and proposed change.", "Download report"],
    ["response", "Response to Reviewers (DOCX)", "The letter for the editor, organised by reviewer with responses, changes and locations.", "Download response"],
    ["json", "Portable data (JSON)", "Structured export of comments, analyses, revisions and responses. The manuscript body is not included.", "Download JSON"],
  ];
  return (
    <>
      {pending > 0 && (
        <div className="mb-5 rounded-md border border-alert/30 bg-alert-soft p-3 text-sm text-alert">
          <b>AUTHOR INPUT REQUIRED</b>: {pending} field(s) in the response still contain placeholders. You can export now, but the placeholders will appear in red in the document.
        </div>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        {items.map(([kind, title, desc, cta]) => (
          <Card key={kind} className="flex flex-col">
            <h2 className="text-lg font-semibold">{title}</h2>
            <p className="mt-1 flex-1 text-sm text-muted">{desc}</p>
            <ButtonLink href={`/projects/${id}/download/${kind}`} prefetch={false} className="mt-4" variant={kind === "response" ? "primary" : "secondary"}>{cta}</ButtonLink>
          </Card>
        ))}
      </div>
      <p className="mt-5 text-sm text-muted">PaperFix does not edit your original manuscript. Apply the accepted changes yourself so every edit stays under your control.</p>
    </>
  );
}
