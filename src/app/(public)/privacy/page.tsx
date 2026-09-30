import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <article className="mx-auto max-w-3xl space-y-4 px-4 py-14 text-sm leading-relaxed">
      <h1 className="text-3xl font-semibold">Privacy</h1>
      <p className="text-muted">Plain-language summary. Have this reviewed by counsel before launch.</p>
      <h2 className="pt-2 text-xl font-semibold">What we store</h2>
      <p>Your account email, the manuscripts, reviewer comments and optional guidelines you upload, and the analyses derived from them. We also keep usage counters (token counts, never content) to apply plan limits.</p>
      <h2 className="pt-2 text-xl font-semibold">Who can see it</h2>
      <p>Only your account. Projects are isolated per user. Manuscript text is never written to application logs.</p>
      <h2 className="pt-2 text-xl font-semibold">AI processing</h2>
      <p>When AI analysis is enabled, only the excerpts of your manuscript relevant to a given comment, plus that comment, are sent to the AI provider (Anthropic) to produce the analysis. We do not use your content to train our own models. Review the provider&apos;s data-handling terms for your deployment.</p>
      <h2 className="pt-2 text-xl font-semibold">Deletion</h2>
      <p>Use “Delete project and its files” on any project to permanently remove it, its derived data and its stored files.</p>
    </article>
  );
}
