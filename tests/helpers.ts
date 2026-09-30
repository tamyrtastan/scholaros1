import { randomUUID } from "node:crypto";
import { MemoryDb } from "./support/memory-db";
import type { Db } from "@/core/db/store";
import { createDemoProject } from "@/modules/paperfix/demo";
import { mockProvider } from "@/modules/paperfix/mock-ai";

/** Mirrors the DB trigger that runs on Supabase signup (profile + free subscription). */
export async function makeUser(db: Db, email: string) {
  const id = randomUUID();
  await db.insert("profiles", { id, display_name: email.split("@")[0], institution: null, research_interests: [], locale: "en" });
  await db.insert("subscriptions", { user_id: id, plan: "free", status: "active", provider: "none", provider_customer_id: null, provider_subscription_id: null, project_credits: 0, current_period_end: null });
  return { id, email };
}

export async function setup() {
  const db = new MemoryDb();
  const alice = await makeUser(db, "alice@example.com");
  const bob = await makeUser(db, "bob@example.com");
  return { db, alice, bob, ai: mockProvider };
}

export async function demoSetup() {
  const s = await setup();
  const project = await createDemoProject(s.db, s.alice.id);
  return { ...s, project };
}
