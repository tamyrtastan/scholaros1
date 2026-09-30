import { promises as fs } from "node:fs";
import path from "node:path";
import { DeleteObjectsCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client, HeadBucketCommand } from "@aws-sdk/client-s3";
import { config } from "../config";
import { ServiceUnavailableError, isConnectivityError } from "../errors";

/**
 * File storage abstraction. Paths are always `<userId>/<projectId>/<file>`.
 * Production: a PRIVATE bucket reached over the S3 protocol (Supabase Storage exposes one; any S3 works).
 * Local: plain directory, for development/tests only (refused in production).
 */
export interface Storage {
  put(storagePath: string, data: Buffer, contentType: string): Promise<void>;
  get(storagePath: string): Promise<Buffer>;
  removePrefix(prefix: string): Promise<void>;
  /** Liveness probe for /api/health. */
  ping(): Promise<void>;
}

export function sanitizeFilename(name: string): string {
  const base = (name.split(/[\\/]/).pop() ?? "").normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").replace(/^\.+/, "");
  const trimmed = base.slice(-100);
  return trimmed || "file";
}

export function assertSafePath(p: string) {
  if (!p || p.split("/").some((s) => s === ".." || s === "" || s === ".") || path.isAbsolute(p) || p.includes("\0")) {
    throw new Error("Invalid storage path");
  }
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
  async ping() {
    await fs.mkdir(this.root, { recursive: true });
  }
}

export class S3Storage implements Storage {
  private client: S3Client;
  constructor(private bucket: string, opts: { endpoint?: string; region: string; accessKeyId: string; secretAccessKey: string; forcePathStyle: boolean }) {
    this.client = new S3Client({
      endpoint: opts.endpoint,
      region: opts.region,
      forcePathStyle: opts.forcePathStyle,
      credentials: { accessKeyId: opts.accessKeyId, secretAccessKey: opts.secretAccessKey },
      maxAttempts: 3,
      // Non-AWS S3 implementations (incl. Supabase) don't all accept the newer default checksum trailers.
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      requestHandler: { connectionTimeout: 5_000, requestTimeout: 20_000 },
    });
  }

  private async wrap<R>(fn: () => Promise<R>): Promise<R> {
    try {
      return await fn();
    } catch (e) {
      const err = e as { name?: string; $metadata?: { httpStatusCode?: number } };
      const status = err.$metadata?.httpStatusCode ?? 0;
      if (isConnectivityError(e) || status >= 500 || status === 429 || err.name === "TimeoutError" || err.name === "SlowDown") {
        throw new ServiceUnavailableError("storage");
      }
      throw e;
    }
  }

  async put(p: string, data: Buffer, contentType: string) {
    assertSafePath(p);
    await this.wrap(() => this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: p, Body: data, ContentType: contentType })));
  }
  async get(p: string) {
    assertSafePath(p);
    return this.wrap(async () => {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: p }));
      return Buffer.from(await res.Body!.transformToByteArray());
    });
  }
  async removePrefix(prefix: string) {
    assertSafePath(prefix);
    await this.wrap(async () => {
      let token: string | undefined;
      do {
        const list = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `${prefix}/`, ContinuationToken: token }));
        const keys = (list.Contents ?? []).map((o) => ({ Key: o.Key! }));
        if (keys.length) {
          const del = await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }));
          if (del.Errors?.length) throw new Error("storage: some objects could not be deleted");
        }
        token = list.IsTruncated ? list.NextContinuationToken : undefined;
      } while (token);
    });
  }
  async ping() {
    await this.wrap(() => this.client.send(new HeadBucketCommand({ Bucket: this.bucket })));
  }
}

let instance: Storage | undefined;
export function getStorage(): Storage {
  if (instance) return instance;
  if (config.providers.storage === "s3") {
    const env = process.env;
    const { S3_BUCKET: bucket, S3_ACCESS_KEY_ID: accessKeyId, S3_SECRET_ACCESS_KEY: secretAccessKey } = env;
    if (!bucket || !accessKeyId || !secretAccessKey) throw new Error("S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for STORAGE_PROVIDER=s3");
    instance = new S3Storage(bucket, {
      endpoint: env.S3_ENDPOINT || undefined,
      region: env.S3_REGION ?? "us-east-1",
      accessKeyId,
      secretAccessKey,
      forcePathStyle: env.S3_FORCE_PATH_STYLE !== "false",
    });
  } else {
    if (config.isProd && process.env.ALLOW_LOCAL_STORAGE !== "true") {
      throw new Error("STORAGE_PROVIDER=local is not allowed in production (ephemeral filesystem)");
    }
    instance = new LocalStorage();
  }
  return instance;
}
