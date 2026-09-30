import type { Tables, TableName } from "./types";

/**
 * Minimal data-access interface. Two implementations: local JSON file (dev/tests) and Supabase (prod).
 * Authorization is enforced in service code (e.g. getOwnedProject), with RLS as defence in depth.
 */
export type InsertRow<T extends TableName> = Omit<Tables[T], "id" | "created_at"> & Partial<Pick<Tables[T], "id" | "created_at">>;

export interface Db {
  insert<T extends TableName>(table: T, row: InsertRow<T>): Promise<Tables[T]>;
  get<T extends TableName>(table: T, id: string): Promise<Tables[T] | null>;
  find<T extends TableName>(table: T, where?: Partial<Tables[T]>): Promise<Tables[T][]>;
  update<T extends TableName>(table: T, id: string, patch: Partial<Tables[T]>): Promise<Tables[T]>;
  remove<T extends TableName>(table: T, where: Partial<Tables[T]>): Promise<number>;
}
