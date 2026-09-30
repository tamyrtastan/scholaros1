import { PLANS, PLAN_ORDER } from "@/core/billing/plans";
import type { PlanId } from "@/core/db/types";
import { Badge, ButtonLink, Card } from "./ui";
import type { ReactNode } from "react";

export function PricingCards({ current, action }: { current?: PlanId; action?: (plan: PlanId) => ReactNode }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {PLAN_ORDER.map((id) => {
        const p = PLANS[id];
        const featured = id === "pro";
        return (
          <Card key={id} className={`flex flex-col ${featured ? "border-brand ring-1 ring-brand" : ""}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{p.name}</h3>
              {featured && <Badge tone="brand">Most popular</Badge>}
              {current === id && <Badge tone="ok">Current</Badge>}
            </div>
            <p className="mt-2 font-serif text-2xl text-brand">{p.price}</p>
            <p className="mt-1 text-sm text-muted">{p.blurb}</p>
            <ul className="mt-4 flex-1 space-y-2 text-sm">
              {p.features.map((f) => (
                <li key={f} className="flex gap-2"><span aria-hidden className="text-ok">✓</span>{f}</li>
              ))}
            </ul>
            <div className="mt-5">
              {action ? action(id) : <ButtonLink href="/signup" variant={featured ? "primary" : "secondary"} className="w-full">{id === "free" ? "Start free" : "Get started"}</ButtonLink>}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
