import { randomUUID } from "node:crypto";
import type { Db, InsertRow } from "@/core/db/store";
import type { TableName, Tables } from "@/core/db/types";

type Data = Record<string, Record<string, unknown>[]>;

/** In-memory Db used by unit tests (production uses PostgresDb). */
export class MemoryDb implements Db {
  private data: Data | null = null;
  private queue: Promise<unknown> = Promise.resolve();


  private async load(): Promise<Data> {
    return (this.data ??= {});
  }

  /** Serialise all operations so concurrent server actions cannot corrupt the file. */
  private run<R>(fn: (d: Data) => R, ...rest: [boolean?]): Promise<R> {
    void rest;
    const next = this.queue.then(async () => {
      const d = await this.load();
      return fn(d);
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private match(row: Record<string, unknown>, where?: Record<string, unknown>) {
    return !where || Object.entries(where).every(([k, v]) => row[k] === v);
  }

  insert<T extends TableName>(table: T, row: InsertRow<T>) {
    return this.run((d) => {
      const full = { id: randomUUID(), created_at: new Date().toISOString(), ...row } as unknown as Tables[T];
      (d[table] ??= []).push(structuredClone(full) as unknown as Record<string, unknown>);
      return full;
    }, true) as Promise<Tables[T]>;
  }
  get<T extends TableName>(table: T, id: string) {
    return this.run((d) => {
      const r = (d[table] ?? []).find((x) => x.id === id);
      return r ? (structuredClone(r) as unknown as Tables[T]) : null;
    }, false);
  }
  find<T extends TableName>(table: T, where?: Partial<Tables[T]>) {
    return this.run(
      (d) =>
        (d[table] ?? [])
          .filter((r) => this.match(r, where as unknown as Record<string, unknown>))
          .map((r) => structuredClone(r) as unknown as Tables[T]),
      false,
    );
  }
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>) {
    return this.run((d) => {
      const r = (d[table] ?? []).find((x) => x.id === id);
      if (!r) throw new Error(`${table}/${id} not found`);
      Object.assign(r, structuredClone(patch));
      return structuredClone(r) as unknown as Tables[T];
    }, true);
  }
  remove<T extends TableName>(table: T, where: Partial<Tables[T]>) {
    return this.run((d) => {
      const before = (d[table] ??= []);
      const kept = before.filter((r) => !this.match(r, where as unknown as Record<string, unknown>));
      d[table] = kept;
      return before.length - kept.length;
    }, true);
  }
}
