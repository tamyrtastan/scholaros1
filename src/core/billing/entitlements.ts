import type { Db } from "../db/store";
import type { PlanId, SubscriptionRow } from "../db/types";
import { LimitError } from "../errors";
import { PLANS, type Plan } from "./plans";

export async function getSubscription(db: Db, userId: string): Promise<SubscriptionRow> {
  const [sub] = await db.find("subscriptions", { user_id: userId });
  if (sub) return sub;
  return db.insert("subscriptions", {
    user_id: userId, plan: "free", status: "active", provider: "none",
    provider_customer_id: null, provider_subscription_id: null, project_credits: 0, current_period_end: null,
  });
}

export async function getPlan(db: Db, userId: string): Promise<Plan> {
  const sub = await getSubscription(db, userId);
  return PLANS[sub.status === "active" ? sub.plan : "free"];
}

export async function setPlan(db: Db, userId: string, plan: PlanId, extra: Partial<SubscriptionRow> = {}) {
  const sub = await getSubscription(db, userId);
  return db.update("subscriptions", sub.id, { plan, status: "active", ...extra });
}

/** Demo projects are free and never count against limits. */
export async function assertCanCreateProject(db: Db, userId: string) {
  const plan = await getPlan(db, userId);
  const owned = (await db.find("projects", { user_id: userId })).filter((p) => !p.is_demo).length;
  if (owned >= plan.limits.maxProjects) {
    throw new LimitError(`Your ${plan.name} plan allows ${plan.limits.maxProjects} project(s). Upgrade to add more.`);
  }
}

export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

export async function tokensUsedThisMonth(db: Db, userId: string, now = new Date()) {
  const from = monthStart(now);
  return (await db.find("usage_events", { user_id: userId }))
    .filter((e) => e.created_at >= from)
    .reduce((s, e) => s + e.input_tokens + e.output_tokens, 0);
}

export async function assertWithinTokenBudget(db: Db, userId: string) {
  const plan = await getPlan(db, userId);
  if ((await tokensUsedThisMonth(db, userId)) >= plan.limits.monthlyTokenBudget) {
    throw new LimitError("You have reached this month's analysis allowance for your plan.");
  }
}

/** Records one usage event together with the plan the user is on right now. */
export async function recordUsage(
  db: Db,
  e: { userId: string; projectId?: string; kind: string; inputTokens?: number; outputTokens?: number; meta?: Record<string, unknown> },
) {
  const plan = (await getPlan(db, e.userId)).id;
  await db.insert("usage_events", {
    user_id: e.userId, project_id: e.projectId ?? null, plan, kind: e.kind,
    input_tokens: e.inputTokens ?? 0, output_tokens: e.outputTokens ?? 0, meta: e.meta ?? {},
  });
}

export interface UsageSummary {
  plan: PlanId;
  month: string;
  projects: { used: number; limit: number };
  tokens: { used: number; budget: number; input: number; output: number };
  analyses: number;
  cacheHits: number;
  byPlan: { plan: PlanId; analyses: number; tokens: number }[];
}

/** Per-user usage for the current calendar month, in total and split by the plan in force when it occurred. */
export async function getUsageSummary(db: Db, userId: string, now = new Date()): Promise<UsageSummary> {
  const plan = await getPlan(db, userId);
  const from = monthStart(now);
  const events = (await db.find("usage_events", { user_id: userId })).filter((e) => e.created_at >= from);
  const byPlan = new Map<PlanId, { plan: PlanId; analyses: number; tokens: number }>();
  let input = 0;
  let output = 0;
  for (const e of events) {
    input += e.input_tokens;
    output += e.output_tokens;
    const row = byPlan.get(e.plan) ?? { plan: e.plan, analyses: 0, tokens: 0 };
    if (e.kind === "ai_analysis") row.analyses++;
    row.tokens += e.input_tokens + e.output_tokens;
    byPlan.set(e.plan, row);
  }
  return {
    plan: plan.id,
    month: from.slice(0, 7),
    projects: { used: (await db.find("projects", { user_id: userId })).filter((p) => !p.is_demo).length, limit: plan.limits.maxProjects },
    tokens: { used: input + output, budget: plan.limits.monthlyTokenBudget, input, output },
    analyses: events.filter((e) => e.kind === "ai_analysis").length,
    cacheHits: events.filter((e) => e.kind === "ai_cache_hit").length,
    byPlan: [...byPlan.values()],
  };
}
