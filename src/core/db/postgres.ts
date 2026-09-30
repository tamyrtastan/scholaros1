import { Pool, types, type PoolConfig } from "pg";
import type { Db, InsertRow } from "./store";
import type { TableName, Tables } from "./types";
import { ServiceUnavailableError, isConnectivityError } from "../errors";

/**
 * Postgres adapter (works with Supabase's direct or pooled connection string).
 * The app connects as a privileged role, so RLS does not apply to it: every caller must enforce
 * ownership in service code (getOwnedProject). RLS protects any other access path.
 */

const TABLES = new Set<string>([
  "profiles", "subscriptions", "usage_events", "projects", "documents", "reviewers", "reviewer_comments",
  "comment_analyses", "author_inputs", "revision_items", "response_entries",
] satisfies TableName[]);

/** jsonb columns must be serialised explicitly (node-pg would turn JS arrays into Postgres arrays). */
const JSON_COLUMNS: Record<string, string[]> = {
  documents: ["structure"],
  usage_events: ["meta"],
  comment_analyses: ["evidence_from_manuscript", "missing_information", "relevant_sections"],
};

const COLUMN = /^[a-z][a-z0-9_]*$/;

// timestamptz -> ISO string (the app compares timestamps as strings)
types.setTypeParser(1184, (v) => new Date(v).toISOString());

function ident(name: string): string {
  if (!COLUMN.test(name)) throw new Error("invalid identifier");
  return `"${name}"`;
}
function table(name: string): string {
  if (!TABLES.has(name)) throw new Error("unknown table");
  return `"${name}"`;
}

export function poolConfigFromEnv(env = process.env): PoolConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is required for DB_PROVIDER=postgres");
  const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(connectionString);
  const mode = env.DATABASE_SSL ?? (local ? "disable" : "require");
  let ssl: PoolConfig["ssl"];
  if (mode === "disable") ssl = false;
  else if (mode === "no-verify") ssl = { rejectUnauthorized: false };
  else ssl = env.DATABASE_SSL_CA ? { ca: env.DATABASE_SSL_CA, rejectUnauthorized: true } : true;
  return {
    connectionString,
    ssl,
    max: Number(env.DATABASE_POOL_MAX ?? 5),
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 15_000,
  };
}

export class PostgresDb implements Db {
  readonly pool: Pool;
  constructor(config: PoolConfig) {
    this.pool = new Pool(config);
    // An idle client erroring (DB restart) must not crash the process; the next query reconnects.
    this.pool.on("error", () => undefined);
  }

  private async q<R extends object>(sql: string, params: unknown[] = []): Promise<R[]> {
    try {
      return (await this.pool.query(sql, params)).rows as R[];
    } catch (e) {
      if (isConnectivityError(e)) throw new ServiceUnavailableError("database");
      throw e;
    }
  }

  private where(where: Record<string, unknown> | undefined, params: unknown[], jsonCols: string[]) {
    const parts = Object.entries(where ?? {}).map(([k, v]) => {
      params.push(jsonCols.includes(k) ? JSON.stringify(v) : v);
      return `${ident(k)} IS NOT DISTINCT FROM $${params.length}`;
    });
    return parts.length ? ` WHERE ${parts.join(" AND ")}` : "";
  }

  private serialise(t: string, row: Record<string, unknown>) {
    const json = JSON_COLUMNS[t] ?? [];
    return Object.entries(row).map(([k, v]) => [k, json.includes(k) && v !== null && v !== undefined ? JSON.stringify(v) : v] as const);
  }

  async insert<T extends TableName>(t: T, row: InsertRow<T>) {
    const entries = this.serialise(t, row as Record<string, unknown>);
    const cols = entries.map(([k]) => ident(k)).join(", ");
    const vals = entries.map((_, i) => `$${i + 1}`).join(", ");
    const sql = entries.length ? `INSERT INTO ${table(t)} (${cols}) VALUES (${vals}) RETURNING *` : `INSERT INTO ${table(t)} DEFAULT VALUES RETURNING *`;
    return (await this.q(sql, entries.map(([, v]) => v)))[0] as Tables[T];
  }

  async get<T extends TableName>(t: T, id: string) {
    try {
      return ((await this.q(`SELECT * FROM ${table(t)} WHERE id = $1`, [id]))[0] ?? null) as Tables[T] | null;
    } catch (e) {
      if ((e as { code?: string }).code === "22P02") return null; // malformed uuid => not found
      throw e;
    }
  }

  async find<T extends TableName>(t: T, where?: Partial<Tables[T]>) {
    const params: unknown[] = [];
    const w = this.where(where as Record<string, unknown>, params, JSON_COLUMNS[t] ?? []);
    try {
      return (await this.q(`SELECT * FROM ${table(t)}${w}`, params)) as Tables[T][];
    } catch (e) {
      if ((e as { code?: string }).code === "22P02") return [];
      throw e;
    }
  }

  async update<T extends TableName>(t: T, id: string, patch: Partial<Tables[T]>) {
    const entries = this.serialise(t, patch as Record<string, unknown>);
    if (!entries.length) {
      const cur = await this.get(t, id);
      if (!cur) throw new Error(`${t}/${id} not found`);
      return cur;
    }
    const sets = entries.map(([k], i) => `${ident(k)} = $${i + 1}`).join(", ");
    const rows = await this.q(`UPDATE ${table(t)} SET ${sets} WHERE id = $${entries.length + 1} RETURNING *`, [...entries.map(([, v]) => v), id]);
    if (!rows.length) throw new Error(`${t}/${id} not found`);
    return rows[0] as Tables[T];
  }

  async remove<T extends TableName>(t: T, where: Partial<Tables[T]>) {
    const params: unknown[] = [];
    const w = this.where(where as Record<string, unknown>, params, JSON_COLUMNS[t] ?? []);
    if (!w) throw new Error("remove() requires a where clause");
    const res = await this.pool.query(`DELETE FROM ${table(t)}${w}`, params).catch((e) => {
      if (isConnectivityError(e)) throw new ServiceUnavailableError("database");
      throw e;
    });
    return res.rowCount ?? 0;
  }

  /** Cheap liveness probe for /api/health. */
  async ping(): Promise<void> {
    await this.q("select 1");
  }

  async close() {
    await this.pool.end();
  }
}
