import type { Metadata } from "next";
import { Button, Card, Flash, Input, Label, PageTitle, Textarea } from "@/components/ui";
import { createProjectAction } from "../../actions";

export const metadata: Metadata = { title: "New project" };

const ACCEPT = ".docx,.pdf,.txt,.md";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card className="space-y-4">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-sm text-white">{n}</span>{title}
      </h2>
      {children}
    </Card>
  );
}

export default async function NewProject({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-3xl">
      <PageTitle title="New project" sub="Your files are visible only to you and can be deleted at any time." />
      <Flash error={sp.error} />
      <form action={createProjectAction} className="space-y-5">
        <Step n={1} title="Project details">
          <div>
            <Label htmlFor="title">Project title</Label>
            <Input id="title" name="title" required maxLength={200} placeholder="e.g. Effects of X on Y: revision 1" />
          </div>
          <div>
            <Label htmlFor="journal" hint="(optional)">Journal name</Label>
            <Input id="journal" name="journal" maxLength={200} />
          </div>
        </Step>

        <Step n={2} title="Upload manuscript">
          <div>
            <Label htmlFor="manuscript_file" hint="DOCX, text-based PDF or TXT · max 10 MB">Manuscript file</Label>
            <Input id="manuscript_file" name="manuscript_file" type="file" accept={ACCEPT} />
          </div>
          <div>
            <Label htmlFor="manuscript_text" hint="or paste the text instead">Manuscript text</Label>
            <Textarea id="manuscript_text" name="manuscript_text" rows={6} placeholder="Paste the full manuscript. Put section names (Abstract, Methods, …) on their own lines." />
          </div>
        </Step>

        <Step n={3} title="Reviewer comments">
          <p className="text-sm text-muted">
            Paste all reviewers together. Start each reviewer with a line like <code>Reviewer 1</code> and number the comments
            (<code>1.</code>, <code>2.</code>…). Multiple reviewers are supported.
          </p>
          <div>
            <Label htmlFor="comments_text">Comments</Label>
            <Textarea id="comments_text" name="comments_text" rows={10} placeholder={"Reviewer 1\n1. The sampling procedure is insufficiently described.\n2. …\n\nReviewer 2\n1. …"} />
          </div>
          <div>
            <Label htmlFor="comments_file" hint="(optional) upload a text or document file instead">Comments file</Label>
            <Input id="comments_file" name="comments_file" type="file" accept={ACCEPT} />
          </div>
        </Step>

        <Step n={4} title="Journal guidelines (optional)">
          <Textarea name="guidelines_text" rows={4} aria-label="Journal guidelines" placeholder="Paste relevant author guidelines (word limits, structure, reporting standards)." />
          <Input name="guidelines_file" type="file" accept={ACCEPT} aria-label="Guidelines file" />
        </Step>

        <div className="flex items-center gap-3">
          <Button type="submit">Create project</Button>
          <p className="text-xs text-muted">Nothing is sent to an AI model until you run the analysis.</p>
        </div>
      </form>
    </div>
  );
}
