import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { getPlan, tokensUsedThisMonth } from "@/core/billing/entitlements";
import { listProjects } from "@/modules/paperfix/service";
import { createDemoAction } from "../actions";
import { Badge, Button, ButtonLink, Card, Flash, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const [projects, plan, used] = await Promise.all([listProjects(db, user.id), getPlan(db, user.id), tokensUsedThisMonth(db, user.id)]);
  const real = projects.filter((p) => !p.is_demo).length;
  const hasDemo = projects.some((p) => p.is_demo);

  return (
    <>
      <Flash {...sp} />
      <PageTitle
        title="Your projects"
        sub="Each project is one manuscript and its reviewer comments."
        action={<ButtonLink href="/projects/new">New project</ButtonLink>}
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card><p className="text-xs uppercase tracking-wide text-muted">Plan</p><p className="mt-1 font-serif text-xl">{plan.name}</p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-muted">Projects used</p><p className="mt-1 font-serif text-xl">{real} / {plan.limits.maxProjects}</p></Card>
        <Card><p className="text-xs uppercase tracking-wide text-muted">AI allowance this month</p><p className="mt-1 font-serif text-xl">{Math.min(100, Math.round((used / plan.limits.monthlyTokenBudget) * 100))}%</p></Card>
      </div>

      {!hasDemo && (
        <Card className="mb-6 flex flex-wrap items-center justify-between gap-3 border-brand/30 bg-brand-soft">
          <div>
            <p className="font-semibold">See PaperFix working in 10 seconds</p>
            <p className="text-sm text-muted">Opens a sample manuscript with six reviewer comments. No confidential material needed.</p>
          </div>
          <form action={createDemoAction}><Button type="submit">Open demo project</Button></form>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card className="text-center text-muted">No projects yet. Create one or open the demo.</Card>
      ) : (
        <div className="divide-y divide-line rounded-lg border border-line bg-card">
          {projects.map((p) => (
            <Link key={p.id} href={`/projects/${p.id}`} className="flex flex-wrap items-center justify-between gap-2 p-4 hover:bg-paper">
              <div>
                <p className="font-medium">{p.title}</p>
                <p className="text-sm text-muted">{p.journal_name || "No journal specified"} · updated {new Date(p.updated_at).toLocaleDateString("en")}</p>
              </div>
              <div className="flex gap-2">
                {p.is_demo && <Badge tone="brand">Demo</Badge>}
                <Badge tone={p.status === "draft" ? "neutral" : "ok"}>{p.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
