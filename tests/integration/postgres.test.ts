import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { analyzeProject, createProject, deleteProject, generateResponses, getOwnedProject, getProjectBundle, listProjects, setRevisionDecision, submitAuthorInput } from "@/modules/paperfix/service";
import { createDemoProject } from "@/modules/paperfix/demo";
import { mockProvider } from "@/modules/paperfix/mock-ai";
import { getSubscription, getUsageSummary, setPlan } from "@/core/billing/entitlements";
import { ServiceUnavailableError } from "@/core/errors";
import { PostgresDb } from "@/core/db/postgres";
import { buildLetterModel, buildResponseDocx } from "@/modules/paperfix/export";
import { extractText } from "@/core/documents/extract";
import { DATABASE_URL, createAuthUser, db as makeDb } from "./env";

const db = makeDb();
afterAll(() => db.close());

describe("signup trigger (real Supabase Auth + Postgres)", () => {
  it("creates a profile and a free subscription for every new auth user", async () => {
    const u = await createAuthUser("trigger");
    expect((await db.get("profiles", u.id))?.display_name).toMatch(/^trigger-/);
    const sub = await getSubscription(db, u.id);
    expect(sub.plan).toBe("free");
    expect((await db.find("subscriptions", { user_id: u.id })).length).toBe(1);
  });
});

describe("PostgresDb adapter", () => {
  it("round-trips jsonb/arrays/timestamps, filters with null, and treats bad ids as not found", async () => {
    const u = await createAuthUser("adapter");
    const p = await db.insert("projects", { user_id: u.id, title: "T", journal_name: null, status: "draft", is_demo: false, updated_at: new Date().toISOString() });
    expect(p.created_at).toMatch(/^\d{4}-\d\d-\d\dT.*Z$/);
    expect((await db.find("projects", { user_id: u.id, journal_name: null })).length).toBe(1); // IS NOT DISTINCT FROM
    const d = await db.insert("documents", { project_id: p.id, type: "manuscript", original_filename: "a.txt", storage_path: null, extracted_text: "x", structure: [{ name: "Methods", confidence: 0.9 }] });
    expect((await db.get("documents", d.id))!.structure).toEqual([{ name: "Methods", confidence: 0.9 }]);
    await db.update("profiles", u.id, { research_interests: ["a", "b"] });
    expect((await db.get("profiles", u.id))!.research_interests).toEqual(["a", "b"]);
    expect(await db.get("projects", "not-a-uuid")).toBeNull();
    expect(await db.find("projects", { id: "nope" } as never)).toEqual([]);
    await expect(db.remove("projects", {})).rejects.toThrow(/where/);
    expect(await db.remove("projects", { id: p.id })).toBe(1);
    expect(await db.find("documents", { project_id: p.id })).toHaveLength(0); // ON DELETE CASCADE
  });
  it("rejects unknown tables/columns (no SQL injection through identifiers)", async () => {
    await expect(db.find("projects; drop table projects" as never)).rejects.toThrow();
    await expect(db.find("projects", { "id = id or 1=1 --": "x" } as never)).rejects.toThrow();
  });
  it("reports an unreachable database as ServiceUnavailableError", async () => {
    const dead = new PostgresDb({ connectionString: "postgres://postgres@127.0.0.1:1/postgres", connectionTimeoutMillis: 1000 });
    await expect(dead.get("projects", "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(ServiceUnavailableError);
    await dead.close();
  });
});

describe("PaperFix end-to-end on real Postgres", () => {
  it("demo project: analyse, author input, decisions, responses, DOCX, ownership, plan limits, deletion", async () => {
    const alice = await createAuthUser("alice");
    const bob = await createAuthUser("bob");
    const project = await createDemoProject(db, alice.id);
    const billable = { ...mockProvider, name: "anthropic" }; // same analyser, but recorded as billable usage
    expect(await analyzeProject(db, billable, alice.id, project.id)).toEqual({ analyzed: 6, cached: 0, failed: 0 });
    expect(await analyzeProject(db, billable, alice.id, project.id)).toEqual({ analyzed: 0, cached: 6, failed: 0 });

    const b = await getProjectBundle(db, alice.id, project.id);
    expect(b.reviewers.map((r) => r.label)).toEqual(["Reviewer 1", "Reviewer 2"]);
    const samp = b.comments.find((c) => /sampling procedure/.test(c.original_comment))!;
    expect(b.analyses.find((a) => a.reviewer_comment_id === samp.id)!.author_input_required).toBe(true);
    expect(Array.isArray(b.analyses[0].evidence_from_manuscript)).toBe(true);

    await submitAuthorInput(db, billable, alice.id, project.id, samp.id, "Allocation used sealed envelopes.");
    const after = await getProjectBundle(db, alice.id, project.id);
    expect(after.analyses.find((a) => a.reviewer_comment_id === samp.id)!.author_input_required).toBe(false);
    await setRevisionDecision(db, alice.id, after.revisions[0].id, "accepted");
    await generateResponses(db, alice.id, project.id);
    const final = await getProjectBundle(db, alice.id, project.id);
    expect(buildLetterModel(final).reviewers).toHaveLength(2);
    expect(await extractText("docx", await buildResponseDocx(final))).toContain("Response to Reviewers");

    // ownership on real rows
    await expect(getOwnedProject(db, bob.id, project.id)).rejects.toThrow(/not found/i);
    await expect(getProjectBundle(db, bob.id, project.id)).rejects.toThrow();
    expect(await listProjects(db, bob.id)).toHaveLength(0);

    // usage per user / plan
    const usage = await getUsageSummary(db, alice.id);
    expect(usage.analyses).toBe(7);
    expect(usage.cacheHits).toBe(6);
    expect(usage.byPlan).toEqual([expect.objectContaining({ plan: "free", analyses: 7 })]);
    await setPlan(db, alice.id, "pro");
    expect((await getUsageSummary(db, alice.id)).plan).toBe("pro");

    // plan limits against real rows
    const files = { manuscript: { filename: "m.txt", text: "Abstract\nx.\nMethods\nWe did it with enough text.", storagePath: null }, reviewerComments: { filename: "c.txt", text: "1. Point", storagePath: null } };
    await setPlan(db, bob.id, "free");
    await createProject(db, bob.id, { title: "P1", ...files });
    await expect(createProject(db, bob.id, { title: "P2", ...files })).rejects.toThrow(/allows 1 project/);

    // deletion removes everything but keeps usage accounting
    const removed: string[] = [];
    await deleteProject(db, { put: async () => {}, get: async () => Buffer.alloc(0), ping: async () => {}, removePrefix: async (p) => void removed.push(p) }, alice.id, project.id);
    expect(removed).toEqual([`${alice.id}/${project.id}`]);
    expect(await db.get("projects", project.id)).toBeNull();
    expect((await db.find("usage_events", { user_id: alice.id })).length).toBeGreaterThan(0);
    expect((await db.find("usage_events", { user_id: alice.id })).every((e) => e.project_id === null || e.project_id !== project.id)).toBe(true);
  });
});

describe("Row-level security (real policies, real roles)", () => {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
  afterAll(() => pool.end());

  /** Runs SQL as the Supabase `authenticated` role with auth.uid() = uid, inside a rolled-back transaction. */
  type Q = ((sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>) & { denied: (sql: string, params?: unknown[]) => Promise<string> };
  async function asUser<T>(uid: string | null, fn: (q: Q) => Promise<T>) {
    const c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query(`SET LOCAL ROLE ${uid ? "authenticated" : "anon"}`);
      if (uid) await c.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [uid]);
      const q = ((sql: string, params?: unknown[]) => c.query(sql, params)) as unknown as Q;
      // run a statement that MUST fail, without poisoning the surrounding transaction; returns the error message
      q.denied = async (sql, params) => {
        await c.query("SAVEPOINT denied");
        try {
          await c.query(sql, params);
          return "NOT DENIED";
        } catch (e) {
          return (e as Error).message;
        } finally {
          await c.query("ROLLBACK TO SAVEPOINT denied");
        }
      };
      return await fn(q);
    } finally {
      await c.query("ROLLBACK");
      c.release();
    }
  }

  it("users see only their own projects and children; anon sees nothing", async () => {
    const a = await createAuthUser("rls-a");
    const b = await createAuthUser("rls-b");
    const pa = await createDemoProject(db, a.id);
    const pb = await createDemoProject(db, b.id);
    await analyzeProject(db, mockProvider, a.id, pa.id);
    await analyzeProject(db, mockProvider, b.id, pb.id);

    await asUser(a.id, async (q) => {
      expect((await q("select id from projects")).rows.map((r) => r.id)).toEqual([pa.id]);
      expect((await q("select distinct project_id from reviewer_comments")).rows.map((r) => r.project_id)).toEqual([pa.id]);
      expect((await q("select distinct project_id from comment_analyses")).rows.map((r) => r.project_id)).toEqual([pa.id]);
      expect((await q("select count(*)::int as n from documents where project_id = $1", [pb.id])).rows[0].n).toBe(0);
      expect((await q("select id from profiles")).rows.map((r) => r.id)).toEqual([a.id]);
    });
    await asUser(b.id, async (q) => {
      expect((await q("select id from projects")).rows.map((r) => r.id)).toEqual([pb.id]);
    });
    await asUser(null, async (q) => {
      expect((await q("select id from projects")).rows).toHaveLength(0);
    });
  });

  it("users cannot modify or delete other users' data, nor write into other users' projects", async () => {
    const a = await createAuthUser("rls-c");
    const b = await createAuthUser("rls-d");
    const pa = await createDemoProject(db, a.id);
    await asUser(b.id, async (q) => {
      expect((await q("update projects set title = 'hacked' where id = $1 returning id", [pa.id])).rows).toHaveLength(0);
      expect((await q("delete from projects where id = $1 returning id", [pa.id])).rows).toHaveLength(0);
      expect(await q.denied("insert into reviewers (project_id, label, position) values ($1, 'evil', 9)", [pa.id])).toMatch(/row-level security/);
      expect(await q.denied("insert into projects (user_id, title) values ($1, 'as someone else')", [a.id])).toMatch(/row-level security/);
    });
    expect((await db.get("projects", pa.id))!.title).toMatch(/^Demo/);
  });

  it("users cannot grant themselves a plan or edit usage; operator view is not readable", async () => {
    const a = await createAuthUser("rls-e");
    await asUser(a.id, async (q) => {
      expect((await q("select plan from subscriptions")).rows).toEqual([{ plan: "free" }]);
      expect((await q("update subscriptions set plan = 'lab' returning id")).rows).toHaveLength(0);
      expect(await q.denied("insert into subscriptions (user_id, plan) values ($1, 'lab')", [a.id])).toMatch(/row-level security/);
      expect(await q.denied("insert into usage_events (user_id, kind) values ($1, 'x')", [a.id])).toMatch(/row-level security/);
    });
    await asUser(a.id, async (q) => {
      expect(await q.denied("select * from usage_by_plan_month")).toMatch(/permission denied/);
    });
    expect((await getSubscription(db, a.id)).plan).toBe("free");
  });
});
