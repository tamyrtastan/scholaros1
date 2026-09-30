import { PricingCards } from "@/components/pricing";
import { AuthorInputBanner, Badge, ButtonLink, Card } from "@/components/ui";

const steps = [
  ["1", "Upload", "Add your manuscript (DOCX, PDF or TXT) and paste the reviewer comments. Journal guidelines are optional."],
  ["2", "Analyse", "Every comment is categorised and mapped to the manuscript sections it concerns, with quoted evidence."],
  ["3", "Revise", "Review proposed changes. Accept, edit or reject each one. Supply anything the paper does not yet say."],
  ["4", "Respond", "PaperFix assembles a structured Response to Reviewers you can edit and export as DOCX."],
];

const features = [
  ["Comment-to-section mapping", "See exactly which part of your paper each comment is about, with verbatim quotes from your text."],
  ["Missing-information detection", "When a reviewer asks for something your manuscript does not contain, PaperFix says so instead of guessing."],
  ["Traceable revisions", "Every proposed change links back to the comment that triggered it and to your decision on it."],
  ["Editable response letter", "Reviewer-by-reviewer responses with changes made and locations. Every line is yours to edit."],
  ["Clean DOCX export", "A revision report for you and a response letter for the editor, formatted for submission."],
  ["Private by design", "Per-user isolation, file validation, project deletion on demand, and no manuscript text in logs."],
];

const faqs = [
  ["Does PaperFix write my paper or my results?", "No. It restructures and rewords what is already in your manuscript and in the inputs you provide. It never invents results, participant numbers, statistics, ethics approvals, methods or citations."],
  ["What happens when information is missing?", "The comment is marked AUTHOR INPUT REQUIRED, with a precise list of what is needed. The proposed revision contains a placeholder, not a made-up answer."],
  ["Is my manuscript kept confidential?", "Projects are visible only to your account, files are validated and stored privately, and you can delete a project and its files at any time. Manuscript text is never written to logs."],
  ["Which file types work?", "DOCX, text-based PDF, and TXT. Scanned PDFs need OCR first. Section detection is heuristic, so check the detected structure."],
  ["Will it edit my original file?", "Not in this version. You get a report and a response letter; you apply changes to your manuscript yourself, staying in control."],
];

export default function Landing() {
  return (
    <>
      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 lg:grid-cols-2 lg:py-20">
        <div>
          <Badge tone="brand">For authors responding to peer review</Badge>
          <h1 className="mt-4 text-4xl font-semibold leading-tight sm:text-5xl">Turn peer-review comments into a clear revision plan.</h1>
          <p className="mt-5 max-w-xl text-lg text-muted">
            Upload your manuscript and peer-review comments. PaperFix maps every comment to your paper, identifies missing
            information, proposes revisions, and prepares a structured response to reviewers.
          </p>
          <div className="mt-7 flex flex-wrap gap-3">
            <ButtonLink href="/signup" className="px-5 py-3 text-base">Analyze my manuscript</ButtonLink>
            <ButtonLink href="/signup" variant="secondary" className="px-5 py-3 text-base">Try the demo project</ButtonLink>
          </div>
          <p className="mt-4 text-sm text-muted">Free to start · No fabricated study data · You stay in control of every change</p>
        </div>

        <Card className="p-0 shadow-md" aria-label="Example of a PaperFix comment card">
          <div className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="text-sm font-medium">Reviewer 1 · Comment 1</span>
            <Badge tone="alert">Needs author input</Badge>
          </div>
          <div className="space-y-4 p-5 text-sm">
            <blockquote className="border-l-2 border-brand pl-3 font-serif text-base italic">
              “The sampling procedure is insufficiently described.”
            </blockquote>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Found in your manuscript · Methods</p>
              <p className="mt-1 text-muted">“Thirty students were in the app group and thirty were in the waiting-list control group.”</p>
            </div>
            <AuthorInputRequiredExample />
          </div>
        </Card>
      </section>

      <section id="how" className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">How it works</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(([n, t, d]) => (
              <div key={n}>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand text-sm font-semibold text-white">{n}</span>
                <h3 className="mt-3 text-lg font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold sm:text-3xl">Academic integrity is the product</h2>
            <p className="mt-3 text-muted">
              Research is only as credible as its details. PaperFix is built so it cannot quietly paper over a gap in your study.
            </p>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                "Never fabricates results, participant numbers, statistics, methods, ethics approvals, citations or DOIs.",
                "Quotes from your manuscript are verified against your text before they are shown.",
                "Anything missing is flagged AUTHOR INPUT REQUIRED and left for you to supply.",
                "Every change is proposed, never applied silently: you accept, edit or reject.",
              ].map((t) => (
                <li key={t} className="flex gap-2"><span aria-hidden className="text-ok">✓</span>{t}</li>
              ))}
            </ul>
          </div>
          <Card>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">Example workflow</p>
            <ol className="mt-3 space-y-4 text-sm">
              <li><b>Reviewer:</b> “Please report effect sizes.”</li>
              <li><b>PaperFix checks</b> your Results section: p-values are reported, effect sizes are not.</li>
              <li><b>Result:</b> flagged as missing. Suggested text contains <span className="font-semibold text-alert">[AUTHOR INPUT REQUIRED: effect sizes]</span>, not an invented number.</li>
              <li><b>You</b> add the real values, PaperFix re-analyses only that comment, and the response letter updates.</li>
            </ol>
          </Card>
        </div>
      </section>

      <section className="border-y border-line bg-card">
        <div className="mx-auto max-w-6xl px-4 py-14">
          <h2 className="text-2xl font-semibold sm:text-3xl">Everything for one revision round</h2>
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(([t, d]) => (
              <div key={t}>
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-semibold sm:text-3xl">Pricing</h2>
        <p className="mt-2 text-muted">Start free. Upgrade when you need a full revision.</p>
        <div className="mt-8"><PricingCards /></div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-6">
        <h2 className="text-2xl font-semibold sm:text-3xl">Frequently asked questions</h2>
        <div className="mt-6 divide-y divide-line rounded-lg border border-line bg-card">
          {faqs.map(([q, a]) => (
            <details key={q} className="group p-4">
              <summary className="cursor-pointer list-none font-medium">{q}</summary>
              <p className="mt-2 text-sm text-muted">{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-14 max-w-4xl px-4">
        <div className="rounded-xl bg-brand px-6 py-10 text-center text-white">
          <h2 className="text-2xl font-semibold sm:text-3xl">Reviewer comments are due. Start with a plan.</h2>
          <p className="mx-auto mt-2 max-w-xl text-white/80">Try the built-in demo project. No confidential material needed.</p>
          <ButtonLink href="/signup" variant="secondary" className="mt-5 px-5 py-3 text-base">Analyze my manuscript</ButtonLink>
        </div>
      </section>
    </>
  );
}

function AuthorInputRequiredExample() {
  return (
    <AuthorInputBanner>
      The manuscript does not say how participants were allocated to the two groups. Please provide the allocation procedure.
    </AuthorInputBanner>
  );
}
