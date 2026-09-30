import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import S3rver from "s3rver";
import { S3Storage, assertSafePath, sanitizeFilename } from "@/core/storage";
import { ServiceUnavailableError } from "@/core/errors";

const port = 54900 + Math.floor(Math.random() * 90);
const dir = mkdtempSync(path.join(os.tmpdir(), "s3-"));
let server: S3rver;
const make = (endpoint = `http://127.0.0.1:${port}`) =>
  new S3Storage("manuscripts", { endpoint, region: "us-east-1", accessKeyId: "S3RVER", secretAccessKey: "S3RVER", forcePathStyle: true });

beforeAll(async () => {
  server = new S3rver({ port, address: "127.0.0.1", silent: true, directory: dir, configureBuckets: [{ name: "manuscripts", configs: [] }] });
  await server.run();
});
afterAll(async () => {
  await server.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("S3 storage adapter (private bucket, S3 protocol)", () => {
  it("round-trips binary content and pings the bucket", async () => {
    const s = make();
    const data = Buffer.from([0, 1, 2, 250, 251, 252, 37, 80, 68, 70]);
    await s.ping();
    await s.put("user-1/proj-1/manuscript-a.pdf", data, "application/pdf");
    expect(Buffer.compare(await s.get("user-1/proj-1/manuscript-a.pdf"), data)).toBe(0);
  });
  it("removePrefix deletes one project's files only (including >1 object) and nothing else", async () => {
    const s = make();
    for (const k of ["u/p1/a.txt", "u/p1/b.txt", "u/p1/c.txt", "u/p10/keep.txt", "u/p2/keep.txt"]) await s.put(k, Buffer.from("x"), "text/plain");
    await s.removePrefix("u/p1");
    await expect(s.get("u/p1/a.txt")).rejects.toThrow();
    await expect(s.get("u/p1/c.txt")).rejects.toThrow();
    expect((await s.get("u/p10/keep.txt")).toString()).toBe("x"); // "p1" must not match "p10"
    expect((await s.get("u/p2/keep.txt")).toString()).toBe("x");
  });
  it("refuses path traversal and odd paths", async () => {
    const s = make();
    for (const bad of ["../x", "a/../b", "/abs", "a//b", "", "a/./b"]) {
      expect(() => assertSafePath(bad)).toThrow();
    }
    await expect(s.put("../escape", Buffer.from("x"), "text/plain")).rejects.toThrow(/Invalid storage path/);
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
  });
  it("reports an unreachable storage service as ServiceUnavailableError", async () => {
    const dead = make("http://127.0.0.1:1");
    await expect(dead.put("u/p/a.txt", Buffer.from("x"), "text/plain")).rejects.toBeInstanceOf(ServiceUnavailableError);
    await expect(dead.ping()).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});
