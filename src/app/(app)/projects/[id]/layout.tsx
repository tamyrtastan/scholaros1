import { notFound } from "next/navigation";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { getOwnedProject } from "@/modules/paperfix/service";
import { Badge, Button, Input } from "@/components/ui";
import { ProjectNav } from "@/components/project-nav";
import { deleteProjectAction } from "../../actions";

export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  const project = await getOwnedProject(getDb(), user.id, id).catch(() => null);
  if (!project) notFound();
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">{project.title}</h1>
        {project.is_demo && <Badge tone="brand">Demo · offline analysis</Badge>}
      </div>
      <ProjectNav id={id} />
      {children}
      <details id="delete" className="mt-14 rounded-lg border border-alert/30 bg-card p-4">
        <summary className="cursor-pointer text-sm font-medium text-alert">Delete project and its files</summary>
        <form action={deleteProjectAction} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="projectId" value={id} />
          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm">This permanently deletes the manuscript, comments, analyses and stored files. Type <b>DELETE</b> to confirm.</label>
            <Input id="confirm" name="confirm" autoComplete="off" className="max-w-xs" />
          </div>
          <Button variant="danger" type="submit">Delete permanently</Button>
        </form>
      </details>
    </>
  );
}
