import type { Metadata } from "next";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { PLANS } from "@/core/billing/plans";
import { getSubscription, getUsageSummary } from "@/core/billing/entitlements";
import { config } from "@/core/config";
import { PricingCards } from "@/components/pricing";
import { Button, Card, Flash, PageTitle } from "@/components/ui";
import { upgradeAction } from "../actions";

export const metadata: Metadata = { title: "Account & billing" };

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; upgraded?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const [sub, usage] = await Promise.all([getSubscription(db, user.id), getUsageSummary(db, user.id)]);
  const plan = PLANS[usage.plan];
  const pct = Math.min(100, Math.round((usage.tokens.used / usage.tokens.budget) * 100));
  return (
    <>
      <Flash error={sp.error} ok={sp.upgraded ? "Plan updated." : undefined} />
      <PageTitle title="Account & billing" />
      <Card className="mb-8 grid gap-4 text-sm sm:grid-cols-2">
        <div><p className="text-muted">Email</p><p className="font-medium">{user.email}</p></div>
        <div><p className="text-muted">Plan</p><p className="font-medium">{plan.name} ({sub.status})</p></div>
        <div><p className="text-muted">Billing mode</p><p className="font-medium">{config.providers.billing === "paddle" ? "Paddle" : "Development (no real charges)"}</p></div>
      </Card>
      <h2 className="mb-3 text-xl font-semibold">Usage this month ({usage.month})</h2>
      <Card className="mb-8 space-y-4 text-sm" data-testid="usage">
        <div>
          <div className="flex justify-between"><span className="text-muted">AI allowance</span><span className="font-medium">{usage.tokens.used.toLocaleString("en")} / {usage.tokens.budget.toLocaleString("en")} tokens ({pct}%)</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded bg-paper" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="AI allowance used"><div className="h-full bg-brand" style={{ width: `${pct}%` }} /></div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-4">
          <div><dt className="text-muted">Projects</dt><dd className="font-medium">{usage.projects.used} / {usage.projects.limit}</dd></div>
          <div><dt className="text-muted">AI analyses</dt><dd className="font-medium" data-testid="usage-analyses">{usage.analyses}</dd></div>
          <div><dt className="text-muted">Reused (free)</dt><dd className="font-medium" data-testid="usage-cache">{usage.cacheHits}</dd></div>
          <div><dt className="text-muted">Tokens in / out</dt><dd className="font-medium">{usage.tokens.input.toLocaleString("en")} / {usage.tokens.output.toLocaleString("en")}</dd></div>
        </dl>
        {usage.byPlan.length > 1 && (
          <p className="text-muted">By plan: {usage.byPlan.map((b) => `${PLANS[b.plan].name}: ${b.analyses} analyses`).join(" · ")}</p>
        )}
        <p className="text-xs text-muted">Demo projects use offline analysis and never consume your allowance.</p>
      </Card>
      <h2 className="mb-3 text-xl font-semibold">Plans</h2>
      <PricingCards
        current={sub.plan}
        action={(id) =>
          id === "free" || id === sub.plan ? null : (
            <form action={upgradeAction}><input type="hidden" name="plan" value={id} /><Button type="submit" className="w-full">{config.providers.billing === "paddle" ? "Upgrade" : "Switch (dev mode)"}</Button></form>
          )
        }
      />
    </>
  );
}
