import { getPostgres } from "@/core/db";
import { getStorage } from "@/core/storage";

export const dynamic = "force-dynamic";

async function probe(fn: () => Promise<unknown>): Promise<"ok" | "down"> {
  try {
    await Promise.race([fn(), new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 4000))]);
    return "ok";
  } catch {
    return "down";
  }
}

/** Liveness of dependencies. Returns status words only: no hostnames, errors or configuration. */
export async function GET() {
  const authUrl = process.env.SUPABASE_URL;
  const [database, storage, auth] = await Promise.all([
    probe(() => getPostgres().ping()),
    probe(() => getStorage().ping()),
    probe(async () => {
      if (!authUrl) throw new Error("not configured");
      const res = await fetch(`${authUrl}/auth/v1/health`, { headers: { apikey: process.env.SUPABASE_ANON_KEY ?? "" } });
      if (!res.ok) throw new Error("unhealthy");
    }),
  ]);
  const ok = database === "ok" && storage === "ok" && auth === "ok";
  return Response.json({ status: ok ? "ok" : "degraded", database, storage, auth }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
