/**
 * Local Supabase-compatible stack used by the E2E suite and integration tests.
 *
 *   Postgres 16  (real)            :54322
 *   GoTrue       (real Supabase Auth, built from upstream source)  :9999, exposed via gateway as /auth/v1 on :54321
 *   SMTP sink + mail API           :54325 (SMTP), mail API on the control port
 *   Email templates                :54326
 *   S3 emulator (s3rver)           :54323  (stands in for Supabase Storage's S3 endpoint)
 *   Fake Anthropic API             :54324  (drives the REAL @anthropic-ai/sdk code path)
 *   Control API                    :54999  (stop/start services, read mail, set fake-AI mode)
 *   App (next start)               :3100
 *
 * Needs: Postgres 16 binaries (PG_BIN), a GoTrue binary (GOTRUE_BIN) and its source dir (GOTRUE_DIR, for ./migrations).
 * For normal development use `supabase start` (Supabase CLI) instead; this exists for sandboxes/CI without Docker Hub.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, rmSync, existsSync, readdirSync, openSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { SMTPServer } from "smtp-server";
import { simpleParser } from "mailparser";
import S3rver from "s3rver";
import { startFakeAnthropic } from "../../tests/support/fake-anthropic";

const ROOT = process.env.STACK_DIR ?? "/tmp/scholaros-stack";
const PG_BIN = process.env.PG_BIN ?? "/usr/lib/postgresql/16/bin";
const GOTRUE_BIN = process.env.GOTRUE_BIN ?? "/tmp/gobin/gotrue";
const GOTRUE_DIR = process.env.GOTRUE_DIR ?? "/tmp/gotrue-src";
const APP_PORT = Number(process.env.APP_PORT ?? 3100);
const P = { pg: 54322, gotrue: 9999, gateway: 54321, s3: 54323, anthropic: 54324, smtp: 54325, templates: 54326, control: 54999 };
const JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters";
const APP_URL = `http://127.0.0.1:${APP_PORT}`;
const PGDATA = path.join(ROOT, "pg");
const asRoot = process.getuid?.() === 0;

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const anonKey = (() => {
  const h = b64({ alg: "HS256", typ: "JWT" });
  const p = b64({ role: "anon", iss: "supabase-local", iat: 1700000000, exp: 4102444800 });
  return `${h}.${p}.${createHmac("sha256", JWT_SECRET).update(`${h}.${p}`).digest("base64url")}`;
})();

const log = (...a: unknown[]) => console.log("[stack]", ...a);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn: () => Promise<boolean>, what: string, tries = 120) {
  for (let i = 0; i < tries; i++) {
    if (await fn().catch(() => false)) return;
    await sleep(500);
  }
  throw new Error(`timeout waiting for ${what}`);
}
const httpOk = (url: string) => fetch(url).then((r) => r.ok);

// ---------------- Postgres ----------------
function pgRun(cmd: string, args: string[]) {
  if (asRoot) return execFileSync("su", ["postgres", "-s", "/bin/bash", "-c", [cmd, ...args].map((a) => `'${a}'`).join(" ")], { stdio: "pipe" });
  return execFileSync(cmd, args, { stdio: "pipe" });
}
const psql = (args: string[]) => execFileSync("psql", ["-h", "127.0.0.1", "-p", String(P.pg), "-U", "postgres", "-v", "ON_ERROR_STOP=1", "-q", ...args], { stdio: "pipe" });
function pgStart() {
  pgRun(`${PG_BIN}/pg_ctl`, ["-D", PGDATA, "-o", `-p ${P.pg} -k ${ROOT} -c listen_addresses=127.0.0.1 -c fsync=off`, "-l", path.join(ROOT, "pg.log"), "-w", "start"]);
}
function pgStop() {
  pgRun(`${PG_BIN}/pg_ctl`, ["-D", PGDATA, "-m", "fast", "-w", "stop"]);
}

// ---------------- GoTrue ----------------
let gotrue: ChildProcess | null = null;
const gotrueEnv = () => ({
  ...process.env,
  GOTRUE_DB_DRIVER: "postgres",
  DATABASE_URL: `postgres://supabase_auth_admin:root@127.0.0.1:${P.pg}/postgres`,
  DB_NAMESPACE: "auth",
  GOTRUE_API_HOST: "127.0.0.1",
  PORT: String(P.gotrue),
  API_EXTERNAL_URL: `http://127.0.0.1:${P.gateway}/auth/v1`,
  GOTRUE_SITE_URL: APP_URL,
  GOTRUE_URI_ALLOW_LIST: `${APP_URL}/**`,
  GOTRUE_JWT_SECRET: JWT_SECRET,
  GOTRUE_JWT_EXP: "3600",
  GOTRUE_MAILER_AUTOCONFIRM: "false",
  GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
  GOTRUE_DISABLE_SIGNUP: "false",
  GOTRUE_PASSWORD_MIN_LENGTH: "8",
  GOTRUE_SMTP_HOST: "127.0.0.1",
  GOTRUE_SMTP_PORT: String(P.smtp),
  GOTRUE_SMTP_ADMIN_EMAIL: "noreply@scholaros.test",
  GOTRUE_SMTP_MAX_FREQUENCY: "1s",
  GOTRUE_RATE_LIMIT_EMAIL_SENT: "1000",
  GOTRUE_MAILER_TEMPLATES_CONFIRMATION: `http://127.0.0.1:${P.templates}/confirmation.html`,
  GOTRUE_MAILER_TEMPLATES_RECOVERY: `http://127.0.0.1:${P.templates}/recovery.html`,
  GOTRUE_MAILER_TEMPLATES_MAGIC_LINK: `http://127.0.0.1:${P.templates}/confirmation.html`,
  GOTRUE_MAILER_TEMPLATES_EMAIL_CHANGE: `http://127.0.0.1:${P.templates}/confirmation.html`,
});
function gotrueStart() {
  gotrue = spawn(GOTRUE_BIN, ["serve"], { cwd: GOTRUE_DIR, env: gotrueEnv(), stdio: ["ignore", openSync(path.join(ROOT, "gotrue.log"), "w"), "inherit"] });
}
async function gotrueStop() {
  gotrue?.kill("SIGTERM");
  await sleep(500);
  gotrue = null;
}

// ---------------- mail ----------------
interface Mail { to: string; subject: string; text: string; html: string; links: string[]; at: number }
const mails: Mail[] = [];
const smtp = new SMTPServer({
  authOptional: true, disabledCommands: ["STARTTLS", "AUTH"], logger: false,
  onData(stream, session, cb) {
    simpleParser(stream).then((m) => {
      const html = String(m.html || "");
      mails.push({
        to: session.envelope.rcptTo.map((r) => r.address).join(","), subject: m.subject ?? "", text: m.text ?? "", html,
        links: [...html.matchAll(/href="([^"]+)"/g)].map((x) => x[1].replace(/&amp;/g, "&")), at: Date.now(),
      });
      cb();
    }, cb);
  },
});
const templates = http.createServer((req, res) => {
  const link = (type: string) => `<h2>${type === "recovery" ? "Reset your password" : "Confirm your signup"}</h2><p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=${type}">Continue</a></p>`;
  res.setHeader("content-type", "text/html");
  res.end(link(req.url?.includes("recovery") ? "recovery" : "signup"));
});

// ---------------- gateway (what Supabase's Kong does) ----------------
const gateway = http.createServer((req, res) => {
  const m = req.url?.match(/^\/auth\/v1(\/.*)?$/);
  if (!m) { res.statusCode = 404; return res.end("not found"); }
  const up = http.request({ host: "127.0.0.1", port: P.gotrue, path: m[1] || "/", method: req.method, headers: { ...req.headers, host: `127.0.0.1:${P.gotrue}` } }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on("error", () => { res.statusCode = 502; res.end("bad gateway"); });
  req.pipe(up);
});

// ---------------- S3 + fake Anthropic ----------------
let s3: S3rver | null = null;
const s3Start = async () => {
  s3 = new S3rver({ port: P.s3, address: "127.0.0.1", silent: true, directory: path.join(ROOT, "s3"), configureBuckets: [{ name: "manuscripts", configs: [] }] });
  await s3.run();
};
const s3Stop = async () => { await s3?.close(); s3 = null; };
let anth: Awaited<ReturnType<typeof startFakeAnthropic>> | null = null;
const anthStart = async () => { anth = await startFakeAnthropic(P.anthropic); };
const anthStop = async () => { await anth?.close(); anth = null; };

// ---------------- app ----------------
let app: ChildProcess | null = null;
const appEnv = () => ({
  ...process.env,
  NODE_ENV: "production",
  PORT: String(APP_PORT),
  APP_URL,
  DB_PROVIDER: "postgres",
  DATABASE_URL: `postgres://postgres@127.0.0.1:${P.pg}/postgres`,
  SUPABASE_URL: `http://127.0.0.1:${P.gateway}`,
  SUPABASE_ANON_KEY: anonKey,
  STORAGE_PROVIDER: "s3",
  S3_ENDPOINT: `http://127.0.0.1:${P.s3}`,
  S3_BUCKET: "manuscripts",
  S3_ACCESS_KEY_ID: "S3RVER",
  S3_SECRET_ACCESS_KEY: "S3RVER",
  AI_PROVIDER: "anthropic",
  ANTHROPIC_API_KEY: "fake-key-for-local-stack",
  ANTHROPIC_BASE_URL: `http://127.0.0.1:${P.anthropic}`,
  AI_MODEL: "claude-sonnet-5-5",
  AI_MAX_RETRIES: "1",
  BILLING_PROVIDER: "dev",
  ALLOW_DEV_BILLING: "true",
  AUTH_RATE_LIMIT_PER_MINUTE: "500", // the suite signs up dozens of users per minute from one IP
}) as NodeJS.ProcessEnv;
// detached => own process group, so shutdown can kill npx AND the next-server it spawns
const appStart = () => { app = spawn("npx", ["next", "start", "-p", String(APP_PORT), "-H", "127.0.0.1"], { env: appEnv(), detached: true, stdio: ["ignore", openSync(path.join(ROOT, "app.log"), "w"), "inherit"] }); };
const appKill = () => { try { if (app?.pid) process.kill(-app.pid, "SIGTERM"); } catch { /* already gone */ } };

// ---------------- control API ----------------
type Svc = "postgres" | "gotrue" | "s3" | "anthropic";
const pgRunning = () => {
  try { pgRun(`${PG_BIN}/pg_ctl`, ["-D", PGDATA, "status"]); return true; } catch { return false; }
};
const gotrueRunning = () => !!gotrue && gotrue.exitCode === null && gotrue.signalCode === null;
// start/stop are idempotent: the test suite restores everything after every test, running or not.
const svcs: Record<Svc, { running: () => boolean; start: () => Promise<void> | void; stop: () => Promise<void> | void }> = {
  postgres: {
    running: pgRunning,
    start: () => {
      pgStart();
      if (!gotrueRunning()) gotrueStart(); // the auth server may have exited while its database was away
    },
    stop: pgStop,
  },
  gotrue: { running: gotrueRunning, start: gotrueStart, stop: gotrueStop },
  s3: { running: () => s3 !== null, start: s3Start, stop: s3Stop },
  anthropic: { running: () => anth !== null, start: anthStart, stop: anthStop },
};
let ready = false;
const control = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const json = (o: unknown, s = 200) => { res.statusCode = s; res.setHeader("content-type", "application/json"); res.end(JSON.stringify(o)); };
  try {
    if (url.pathname === "/ready") return json({ ready }, ready ? 200 : 503);
    if (url.pathname === "/mail") {
      const to = url.searchParams.get("to");
      return json(mails.filter((m) => !to || m.to.includes(to)));
    }
    if (url.pathname === "/mail/clear") { mails.length = 0; return json({ ok: true }); }
    const m = url.pathname.match(/^\/svc\/(\w+)\/(start|stop)$/);
    if (m && m[1] in svcs) {
      const svc = svcs[m[1] as Svc];
      const wantRunning = m[2] === "start";
      if (svc.running() !== wantRunning) await svc[m[2] as "start" | "stop"]();
      else if (wantRunning && m[1] === "postgres" && !gotrueRunning()) gotrueStart();
      return json({ ok: true });
    }
    if (url.pathname.startsWith("/anthropic/mode/")) {
      await fetch(`http://127.0.0.1:${P.anthropic}/__mode/${url.pathname.split("/").pop()}`, { method: "POST" });
      return json({ ok: true });
    }
    if (url.pathname === "/anthropic/count") return json(await (await fetch(`http://127.0.0.1:${P.anthropic}/__count`)).json());
    if (url.pathname === "/anthropic/reset") { await fetch(`http://127.0.0.1:${P.anthropic}/__reset`, { method: "POST" }); return json({ ok: true }); }
    json({ error: "unknown" }, 404);
  } catch (e) {
    json({ error: String(e) }, 500);
  }
});

async function main() {
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(path.join(ROOT, "stack.pid"), String(process.pid));
  if (asRoot) execFileSync("chown", ["-R", "postgres", ROOT]);
  const fresh = !existsSync(path.join(PGDATA, "PG_VERSION")) || process.env.STACK_FRESH !== "false";
  try { pgStop(); } catch { /* not running */ }
  if (fresh) {
    rmSync(PGDATA, { recursive: true, force: true });
    rmSync(path.join(ROOT, "s3"), { recursive: true, force: true });
    mkdirSync(path.join(ROOT, "s3"), { recursive: true });
    pgRun(`${PG_BIN}/initdb`, ["-D", PGDATA, "-A", "trust", "-U", "postgres"]);
  }
  pgStart();
  if (fresh) psql(["-f", path.join(import.meta.dirname, "bootstrap.sql")]);
  log("postgres up");

  // GoTrue migrates its own schema first (the app migrations reference auth.users).
  execFileSync(GOTRUE_BIN, ["migrate"], { cwd: GOTRUE_DIR, env: gotrueEnv(), stdio: "pipe" });
  await new Promise<void>((r) => smtp.listen(P.smtp, "127.0.0.1", r));
  await new Promise<void>((r) => templates.listen(P.templates, "127.0.0.1", r));
  await new Promise<void>((r) => gateway.listen(P.gateway, "127.0.0.1", r));
  gotrueStart();
  await waitFor(() => httpOk(`http://127.0.0.1:${P.gotrue}/health`), "gotrue");
  log("gotrue up");

  const migDir = path.join(import.meta.dirname, "../../supabase/migrations");
  for (const f of readdirSync(migDir).filter((x) => x.endsWith(".sql")).sort()) {
    if (fresh) psql(["-f", path.join(migDir, f)]);
  }
  log("migrations applied");

  await s3Start();
  await anthStart();
  await new Promise<void>((r) => control.listen(P.control, "127.0.0.1", r));
  if (!existsSync(".next/BUILD_ID")) throw new Error("run `npm run build` first");
  appStart();
  await waitFor(() => httpOk(`${APP_URL}/`), "app");
  ready = true;
  log("READY", JSON.stringify({ app: APP_URL, control: P.control }));
}

const shutdown = async () => {
  appKill(); gotrue?.kill("SIGTERM");
  try { await s3?.close(); await anth?.close(); } catch { /* ignore */ }
  try { pgStop(); } catch { /* ignore */ }
  process.exit(0);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
main().catch((e) => { console.error("[stack] FAILED", e); void shutdown(); });
