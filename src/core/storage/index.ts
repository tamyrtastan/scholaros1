import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "../config";

/** File storage abstraction (Supabase Storage compatible). Paths are always `<userId>/<projectId>/<file>`. */
export interface Storage {
  put(storagePath: string, data: Buffer, contentType: string): Promise<void>;
  get(storagePath: string): Promise<Buffer>;
  removePrefix(prefix: string): Promise<void>;
}

export function sanitizeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").replace(/^\.+/, "");
  const trimmed = base.slice(-100);
  return trimmed || "file";
}

function assertSafePath(p: string) {
  if (p.split("/").some((s) => s === ".." || s === "") || path.isAbsolute(p)) throw new Error("Invalid storage path");
}

class LocalStorage implements Storage {
  constructor(private root = process.env.LOCAL_STORAGE_DIR ?? "data/files") {}
  async put(p: string, data: Buffer) {
    assertSafePath(p);
    const full = path.join(this.root, p);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, data);
  }
  async get(p: string) {
    assertSafePath(p);
    return fs.readFile(path.join(this.root, p));
  }
  async removePrefix(prefix: string) {
    assertSafePath(prefix);
    await fs.rm(path.join(this.root, prefix), { recursive: true, force: true });
  }
}

class SupabaseStorage implements Storage {
  private bucket = process.env.SUPABASE_STORAGE_BUCKET ?? "manuscripts";
  private client;
  constructor(url: string, key: string) {
    this.client = createClient(url, key, { auth: { persistSession: false } });
  }
  async put(p: string, data: Buffer, contentType: string) {
    assertSafePath(p);
    const { error } = await this.client.storage.from(this.bucket).upload(p, data, { contentType, upsert: true });
    if (error) throw new Error(`storage: ${error.message}`);
  }
  async get(p: string) {
    assertSafePath(p);
    const { data, error } = await this.client.storage.from(this.bucket).download(p);
    if (error || !data) throw new Error("storage: download failed");
    return Buffer.from(await data.arrayBuffer());
  }
  async removePrefix(prefix: string) {
    assertSafePath(prefix);
    const { data } = await this.client.storage.from(this.bucket).list(prefix);
    if (data?.length) await this.client.storage.from(this.bucket).remove(data.map((f) => `${prefix}/${f.name}`));
  }
}

let instance: Storage | undefined;
export function getStorage(): Storage {
  if (instance) return instance;
  if (config.providers.storage === "supabase") {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for STORAGE_PROVIDER=supabase");
    instance = new SupabaseStorage(url, key);
  } else instance = new LocalStorage();
  return instance;
}
