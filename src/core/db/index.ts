import { config } from "../config";
import type { Db } from "./store";
import { LocalDb } from "./local";
import { SupabaseDb } from "./supabase";

const g = globalThis as unknown as { __scholarosDb?: Db };

export function getDb(): Db {
  if (g.__scholarosDb) return g.__scholarosDb;
  if (config.providers.db === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for DB_PROVIDER=supabase");
    g.__scholarosDb = new SupabaseDb(url, key);
  } else {
    g.__scholarosDb = new LocalDb(process.env.LOCAL_DB_PATH ?? "data/db.json");
  }
  return g.__scholarosDb;
}

export type { Db };
export * from "./types";
