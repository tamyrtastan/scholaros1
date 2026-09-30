import { PostgresDb } from "@/core/db/postgres";

export const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL ?? "postgres://postgres@127.0.0.1:54322/postgres";
export const SUPABASE_URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
export const ANON_KEY = process.env.INTEGRATION_SUPABASE_ANON_KEY ?? "anon";
export const CONTROL = process.env.INTEGRATION_CONTROL_URL ?? "http://127.0.0.1:54999";

export const db = () => new PostgresDb({ connectionString: DATABASE_URL, max: 4, connectionTimeoutMillis: 3000 });

let n = 0;
/** Creates a real auth user through the real Supabase Auth API. The DB trigger provisions profile + subscription. */
export async function createAuthUser(prefix = "it"): Promise<{ id: string; email: string }> {
  const email = `${prefix}-${Date.now()}-${n++}@example.com`;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { "content-type": "application/json", apikey: ANON_KEY },
    body: JSON.stringify({ email, password: "correct-horse-battery" }),
  });
  if (!res.ok) throw new Error(`signup failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { id?: string; user?: { id: string } };
  const id = json.id ?? json.user?.id;
  if (!id) throw new Error("no user id");
  return { id, email };
}
