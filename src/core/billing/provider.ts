import { createHmac, timingSafeEqual } from "node:crypto";
import type { Db } from "../db/store";
import type { PlanId } from "../db/types";
import { config } from "../config";
import { AppError } from "../errors";
import { setPlan } from "./entitlements";

export interface BillingProvider {
  name: string;
  /** Returns a URL to send the user to (or applies the plan immediately in dev mode). */
  startCheckout(db: Db, userId: string, plan: Exclude<PlanId, "free">): Promise<{ url: string }>;
}

/** Development billing: no money moves, the plan is applied instantly. Disabled in production. */
const devProvider: BillingProvider = {
  name: "dev",
  async startCheckout(db, userId, plan) {
    if (config.isProd && process.env.ALLOW_DEV_BILLING !== "true") throw new AppError("Dev billing is disabled in production");
    await setPlan(db, userId, plan, { provider: "dev", project_credits: plan === "single" ? 1 : 0 });
    return { url: "/account?upgraded=1" };
  },
};

const PRICE_ENV: Record<string, string> = { single: "PADDLE_PRICE_SINGLE", pro: "PADDLE_PRICE_PRO", lab: "PADDLE_PRICE_LAB" };

/** Paddle Billing: creates a transaction and returns its hosted checkout URL. Not exercised against live Paddle yet. */
const paddleProvider: BillingProvider = {
  name: "paddle",
  async startCheckout(_db, userId, plan) {
    const key = process.env.PADDLE_API_KEY;
    const price = process.env[PRICE_ENV[plan]];
    if (!key || !price) throw new AppError("Billing is not configured");
    const res = await fetch("https://api.paddle.com/transactions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ items: [{ price_id: price, quantity: 1 }], custom_data: { user_id: userId, plan } }),
    });
    if (!res.ok) throw new AppError("Could not start checkout");
    const json = (await res.json()) as { data?: { checkout?: { url?: string } } };
    const url = json.data?.checkout?.url;
    if (!url) throw new AppError("Could not start checkout");
    return { url };
  },
};

export function getBilling(): BillingProvider {
  return config.providers.billing === "paddle" ? paddleProvider : devProvider;
}

/** Paddle Billing signature header: `ts=<unix>;h1=<hex hmac-sha256 of "ts:rawBody">` */
export function verifyPaddleSignature(rawBody: string, header: string | null, secret: string, now = Date.now(), toleranceSec = 300): boolean {
  if (!header) return false;
  const parts = Object.fromEntries(header.split(";").map((p) => p.split("=") as [string, string]));
  const ts = parts.ts;
  const h1 = parts.h1;
  if (!ts || !h1 || Math.abs(now / 1000 - Number(ts)) > toleranceSec) return false;
  const expected = createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(h1);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface PaddleEvent {
  event_type: string;
  data: { id?: string; customer_id?: string; status?: string; custom_data?: { user_id?: string; plan?: string } | null; next_billed_at?: string | null };
}

/** Applies a verified webhook event to our subscriptions table. Idempotent (sets absolute state). */
export async function applyPaddleEvent(db: Db, evt: PaddleEvent): Promise<boolean> {
  const userId = evt.data.custom_data?.user_id;
  const plan = evt.data.custom_data?.plan as PlanId | undefined;
  if (!userId || !plan || !["single", "pro", "lab"].includes(plan)) return false;
  const base = { provider: "paddle", provider_customer_id: evt.data.customer_id ?? null, provider_subscription_id: evt.data.id ?? null };
  switch (evt.event_type) {
    case "transaction.completed":
    case "subscription.created":
    case "subscription.activated":
    case "subscription.updated":
      await setPlan(db, userId, plan, { ...base, project_credits: plan === "single" ? 1 : 0, current_period_end: evt.data.next_billed_at ?? null });
      return true;
    case "subscription.canceled":
      await setPlan(db, userId, "free", { ...base, status: "active" });
      return true;
    case "subscription.past_due":
      await setPlan(db, userId, plan, { ...base, status: "past_due" });
      return true;
    default:
      return false;
  }
}
