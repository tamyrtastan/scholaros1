import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { Db } from "./store";
import type { TableName, Tables } from "./types";

type Data = Record<string, Record<string, unknown>[]>;

/** JSON-file backed store for local development and tests. Pass `null` for a purely in-memory store. */
export class LocalDb implements Db {
  private data: Data | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private file: string | null) {}

  private async load(): Promise<Data> {
    if (this.data) return this.data;
    if (this.file) {
      try {
        this.data = JSON.parse(await fs.readFile(this.file, "utf8")) as Data;
      } catch {
        this.data = {};
      }
    } else this.data = {};
    return this.data;
  }

  private async persist() {
    if (!this.file || !this.data) return;
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(tmp, JSON.stringify(this.data));
    await fs.rename(tmp, this.file);
  }

  /** Serialise all operations so concurrent server actions cannot corrupt the file. */
  private run<R>(fn: (d: Data) => R, write: boolean): Promise<R> {
    const next = this.queue.then(async () => {
      const d = await this.load();
      const r = fn(d);
      if (write) await this.persist();
      return r;
    });
    this.queue = next.catch(() => undefined);
    return next;
  }

  private match(row: Record<string, unknown>, where?: Record<string, unknown>) {
    return !where || Object.entries(where).every(([k, v]) => row[k] === v);
  }

  insert<T extends TableName>(table: T, row: Parameters<Db["insert"]>[1]) {
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
