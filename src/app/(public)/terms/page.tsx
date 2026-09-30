import type { Metadata } from "next";

export const metadata: Metadata = { title: "Terms" };

export default function Terms() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-14 text-sm leading-relaxed">
      <h1 className="text-3xl font-semibold">Terms of service</h1>
      <p className="rounded-md border border-warn/30 bg-warn-soft p-3 text-warn">Placeholder: replace with reviewed legal terms before accepting paying customers.</p>
      <p>PaperFix is an assistant. Authors remain solely responsible for the content, accuracy and integrity of their manuscripts and responses, and for complying with journal and institutional policies.</p>
      <p>Do not use the service to fabricate data, results, approvals or citations.</p>
    </article>
  );
}
