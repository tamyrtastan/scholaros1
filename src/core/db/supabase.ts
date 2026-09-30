import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Db } from "./store";
import type { TableName, Tables } from "./types";

/**
 * Supabase/Postgres adapter using the SERVICE ROLE key (server only).
 * Because the service role bypasses RLS, every caller must go through ownership checks in services.
 * NOTE: written against the same interface as LocalDb but NOT yet exercised against a live project.
 */
export class SupabaseDb implements Db {
  private client: SupabaseClient;
  constructor(url: string, serviceKey: string) {
    this.client = createClient(url, serviceKey, { auth: { persistSession: false } });
  }
  private unwrap<R>(res: { data: R | null; error: { message: string } | null }): R {
    if (res.error) throw new Error(`db: ${res.error.message}`);
    return res.data as R;
  }
  async insert<T extends TableName>(table: T, row: Parameters<Db["insert"]>[1]) {
    return this.unwrap(await this.client.from(table).insert(row).select().single()) as Tables[T];
  }
  async get<T extends TableName>(table: T, id: string) {
    return this.unwrap(await this.client.from(table).select().eq("id", id).maybeSingle()) as Tables[T] | null;
  }
  async find<T extends TableName>(table: T, where: Partial<Tables[T]> = {}) {
    let q = this.client.from(table).select();
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v as never);
    return (this.unwrap(await q) ?? []) as Tables[T][];
  }
  async update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    return this.unwrap(await this.client.from(table).update(patch as never).eq("id", id).select().single()) as Tables[T];
  }
  async remove<T extends TableName>(table: T, where: Partial<Tables[T]>) {
    let q = this.client.from(table).delete({ count: "exact" });
    for (const [k, v] of Object.entries(where)) q = q.eq(k, v as never);
    const res = await q;
    if (res.error) throw new Error(`db: ${res.error.message}`);
    return res.count ?? 0;
  }
}
