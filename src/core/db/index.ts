import { config } from "../config";
import type { Db } from "./store";
import { PostgresDb, poolConfigFromEnv } from "./postgres";

const g = globalThis as unknown as { __scholarosDb?: PostgresDb };

/** The app database (Postgres / Supabase). Tests inject an in-memory Db directly into services instead. */
export function getDb(): Db {
  return getPostgres();
}

export function getPostgres(): PostgresDb {
  if (config.providers.db !== "postgres") throw new Error("DB_PROVIDER must be 'postgres'");
  return (g.__scholarosDb ??= new PostgresDb(poolConfigFromEnv()));
}

export type { Db };
export * from "./types";
