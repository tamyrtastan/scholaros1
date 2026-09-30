import { LocalDb } from "@/core/db/local";
import { signUp } from "@/core/auth/accounts";
import { createDemoProject } from "@/modules/paperfix/demo";
import { mockProvider } from "@/modules/paperfix/mock-ai";

export async function setup() {
  const db = new LocalDb(null);
  const alice = await signUp(db, { email: "alice@example.com", password: "correct-horse" });
  const bob = await signUp(db, { email: "bob@example.com", password: "battery-staple" });
  return { db, alice, bob, ai: mockProvider };
}

export async function demoSetup() {
  const s = await setup();
  const project = await createDemoProject(s.db, s.alice.id);
  return { ...s, project };
}
