import type { Metadata } from "next";
import { requireUser } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { getPlan, getSubscription, tokensUsedThisMonth } from "@/core/billing/entitlements";
import { config } from "@/core/config";
import { PricingCards } from "@/components/pricing";
import { Button, Card, Flash, PageTitle } from "@/components/ui";
import { upgradeAction } from "../actions";

export const metadata: Metadata = { title: "Account & billing" };

export default async function Account({ searchParams }: { searchParams: Promise<{ error?: string; upgraded?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const db = getDb();
  const [sub, plan, used] = await Promise.all([getSubscription(db, user.id), getPlan(db, user.id), tokensUsedThisMonth(db, user.id)]);
  return (
    <>
      <Flash error={sp.error} ok={sp.upgraded ? "Plan updated." : undefined} />
      <PageTitle title="Account & billing" />
      <Card className="mb-8 grid gap-4 text-sm sm:grid-cols-2">
        <div><p className="text-muted">Email</p><p className="font-medium">{user.email}</p></div>
        <div><p className="text-muted">Plan</p><p className="font-medium">{plan.name} ({sub.status})</p></div>
        <div><p className="text-muted">AI usage this month</p><p className="font-medium">{used.toLocaleString("en")} / {plan.limits.monthlyTokenBudget.toLocaleString("en")} tokens</p></div>
        <div><p className="text-muted">Billing mode</p><p className="font-medium">{config.providers.billing === "paddle" ? "Paddle" : "Development (no real charges)"}</p></div>
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
