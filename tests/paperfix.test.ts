import { describe, expect, it } from "vitest";
import { analyzeProject, buildResponseEntry, createProject, deleteProject, deleteProjectRows, generateResponses, getOwnedProject, getProjectBundle, setCommentStatus, setRevisionDecision, submitAuthorInput, updateResponseEntry } from "@/modules/paperfix/service";
import { buildJsonExport, buildLetterModel, buildReportDocx, buildResponseDocx } from "@/modules/paperfix/export";
import { extractText } from "@/core/documents/extract";
import { getSubscription, setPlan, tokensUsedThisMonth } from "@/core/billing/entitlements";
import { applyPaddleEvent, verifyPaddleSignature } from "@/core/billing/provider";
import { createHmac } from "node:crypto";
import type { Storage } from "@/core/storage";
import { demoSetup, setup } from "./helpers";
import { createDemoProject } from "@/modules/paperfix/demo";
import { getUsageSummary } from "@/core/billing/entitlements";

const nullStorage: Storage & { removed: string[] } = { removed: [], async put() {}, async get() { return Buffer.alloc(0); }, async ping() {}, async removePrefix(p) { this.removed.push(p); } };

describe("demo project end-to-end (mock AI)", () => {
  it("analyses every comment and flags missing allocation procedure", async () => {
    const { db, ai, alice, project } = await demoSetup();
    const res = await analyzeProject(db, ai, alice.id, project.id);
    expect(res).toEqual({ analyzed: 6, cached: 0, failed: 0 });
    const b = await getProjectBundle(db, alice.id, project.id);
    const c1 = b.comments.find((c: { original_comment: string }) => c.original_comment.startsWith("The sampling procedure"))!;
    const a1 = b.analyses.find((a) => a.reviewer_comment_id === c1.id)!;
    expect(a1.author_input_required).toBe(true);
    expect(a1.suggested_revision).toContain("AUTHOR INPUT REQUIRED");
    expect(c1.status).toBe("needs_author_input");
    expect(c1.category).toBe("methodology");
    expect(b.comments.some((c) => c.status === "ready")).toBe(true);
    expect(b.revisions).toHaveLength(6);
  });

  it("reuses cached analyses: second run makes no AI calls", async () => {
    const { db, ai: mock, alice, project } = await demoSetup();
    const ai = { ...mock, name: "anthropic" }; // a billable provider, so usage is recorded
    await analyzeProject(db, ai, alice.id, project.id);
    const before = (await db.find("usage_events", { user_id: alice.id })).filter((e: { kind: string }) => e.kind === "ai_analysis").length;
    const res = await analyzeProject(db, ai, alice.id, project.id);
    expect(res).toEqual({ analyzed: 0, cached: 6, failed: 0 });
    expect((await db.find("usage_events", { user_id: alice.id })).filter((e: { kind: string }) => e.kind === "ai_analysis").length).toBe(before);
    expect(await tokensUsedThisMonth(db, alice.id)).toBeGreaterThan(0);
  });

  it("author input re-analyses only that comment and clears the requirement", async () => {
    const { db, ai, alice, project } = await demoSetup();
    await analyzeProject(db, ai, alice.id, project.id);
    const b = await getProjectBundle(db, alice.id, project.id);
    const c1 = b.comments.find((c: { original_comment: string }) => c.original_comment.startsWith("The sampling procedure"))!;
    const res = await submitAuthorInput(db, ai, alice.id, project.id, c1.id, "Students were allocated by a sealed-envelope draw.");
    expect(res.analyzed).toBe(1);
    const after = await getProjectBundle(db, alice.id, project.id);
    const a = after.analyses.find((x) => x.reviewer_comment_id === c1.id)!;
    expect(a.author_input_required).toBe(false);
    expect(a.suggested_revision).toContain("sealed-envelope");
    expect(after.comments.find((c) => c.id === c1.id)!.status).toBe("ready");
  });

  it("supports accept / edit / reject / resolve and records analytics-safe state", async () => {
    const { db, ai, alice, project } = await demoSetup();
    await analyzeProject(db, ai, alice.id, project.id);
    const b = await getProjectBundle(db, alice.id, project.id);
    const [r1, r2, r3] = b.revisions;
    await setRevisionDecision(db, alice.id, r1.id, "accepted");
    await setRevisionDecision(db, alice.id, r2.id, "edited", "My own wording.");
    await setRevisionDecision(db, alice.id, r3.id, "rejected");
    await expect(setRevisionDecision(db, alice.id, r1.id, "edited", "  ")).rejects.toThrow(/empty/);
    await setCommentStatus(db, alice.id, r1.reviewer_comment_id, "resolved");
    const after = await getProjectBundle(db, alice.id, project.id);
    expect(after.revisions.find((r) => r.id === r2.id)!.proposed_text).toBe("My own wording.");
    expect(after.revisions.find((r) => r.id === r3.id)!.author_decision).toBe("rejected");
    expect(after.comments.find((c) => c.id === r1.reviewer_comment_id)!.status).toBe("resolved");
  });
});

describe("project ownership enforcement", () => {
  it("prevents another user from reading, analysing, editing or deleting a project", async () => {
    const { db, ai, alice, bob, project } = await demoSetup();
    await analyzeProject(db, ai, alice.id, project.id);
    const b = await getProjectBundle(db, alice.id, project.id);
    await expect(getOwnedProject(db, bob.id, project.id)).rejects.toThrow(/not found/i);
    await expect(getProjectBundle(db, bob.id, project.id)).rejects.toThrow();
    await expect(analyzeProject(db, ai, bob.id, project.id)).rejects.toThrow();
    await expect(setRevisionDecision(db, bob.id, b.revisions[0].id, "accepted")).rejects.toThrow();
    await expect(setCommentStatus(db, bob.id, b.comments[0].id, "resolved")).rejects.toThrow();
    await expect(submitAuthorInput(db, ai, bob.id, project.id, b.comments[0].id, "x")).rejects.toThrow();
    await expect(generateResponses(db, bob.id, project.id)).rejects.toThrow();
    await expect(deleteProject(db, nullStorage, bob.id, project.id)).rejects.toThrow();
    expect(await db.get("projects", project.id)).not.toBeNull();
  });
  it("rejects comment ids from a different project even for the owner", async () => {
    const { db, ai, alice, project } = await demoSetup();
    const other = await createDemoProject(db, alice.id);
    const ob = await getProjectBundle(db, alice.id, other.id);
    await expect(submitAuthorInput(db, ai, alice.id, project.id, ob.comments[0].id, "x")).rejects.toThrow(/not found/i);
  });
});

describe("response to reviewers", () => {
  it("assembles by reviewer with placeholders for unresolved items and preserves author edits", async () => {
    const { db, ai, alice, project } = await demoSetup();
    await analyzeProject(db, ai, alice.id, project.id);
    expect(await generateResponses(db, alice.id, project.id)).toBe(6);
    let b = await getProjectBundle(db, alice.id, project.id);
    const letter = buildLetterModel(b);
    expect(letter.reviewers.map((r) => r.label)).toEqual(["Reviewer 1", "Reviewer 2"]);
    expect(letter.reviewers[0].items[0].comment).toMatch(/sampling procedure/);
    expect(letter.pendingCount).toBeGreaterThan(0);

    const entry = b.responses[0];
    await updateResponseEntry(db, alice.id, entry.id, { author_response: "Custom reply.", change_summary: "Custom change.", manuscript_location: "p. 4" });
    await generateResponses(db, alice.id, project.id); // regenerate
    b = await getProjectBundle(db, alice.id, project.id);
    expect(b.responses.find((r) => r.id === entry.id)!.author_response).toBe("Custom reply.");
  });
  it("buildResponseEntry covers decision states", () => {
    const a = { manuscript_section: "Methods", suggested_response: "Thanks." } as never;
    expect(buildResponseEntry(a, { author_decision: "rejected" } as never).change_summary).toMatch(/No change/);
    expect(buildResponseEntry(a, { author_decision: "accepted", proposed_text: "New." } as never).change_summary).toContain("New.");
    expect(buildResponseEntry(undefined, undefined).author_response).toContain("AUTHOR INPUT REQUIRED");
  });
});

describe("exports", () => {
  it("produces valid DOCX files containing the expected content, and JSON", async () => {
    const { db, ai, alice, project } = await demoSetup();
    await analyzeProject(db, ai, alice.id, project.id);
    await generateResponses(db, alice.id, project.id);
    const b = await getProjectBundle(db, alice.id, project.id);
    const resp = await buildResponseDocx(b);
    const rep = await buildReportDocx(b);
    expect(resp.subarray(0, 2).toString()).toBe("PK");
    const respText = await extractText("docx", resp);
    expect(respText).toContain("Response to Reviewers");
    expect(respText).toContain("Reviewer 2");
    expect(respText).toContain("AUTHOR INPUT REQUIRED");
    expect(await extractText("docx", rep)).toContain("Revision Report");
    const json = buildJsonExport(b);
    expect(json.reviewers[0].comments[0].analysis?.author_input_required).toBe(true);
    expect(JSON.stringify(json)).not.toContain("input_hash");
  });
});

describe("project creation, limits and deletion", () => {
  const files = (comments: string) => ({
    manuscript: { filename: "m.txt", text: "Abstract\nA.\nIntroduction\nBackground text here for the paper.\nMethods\nWe did it.", storagePath: null },
    reviewerComments: { filename: "c.txt", text: comments, storagePath: null },
  });
  it("validates input", async () => {
    const { db, alice } = await setup();
    await expect(createProject(db, alice.id, { title: " ", ...files("1. x") })).rejects.toThrow(/title/i);
    await expect(createProject(db, alice.id, { title: "T", ...files("  ") })).rejects.toThrow(/at least one/i);
  });
  it("enforces free-plan limits; demo projects do not count; upgrading raises limits", async () => {
    const { db, alice } = await setup();
    await createDemoProject(db, alice.id);
    await createProject(db, alice.id, { title: "P1", ...files("1. a point") });
    await expect(createProject(db, alice.id, { title: "P2", ...files("1. a point") })).rejects.toThrow(/allows 1 project/);
    await expect(createProject(db, alice.id, { title: "P3", ...files("1. a\n2. b\n3. c\n4. d\n5. e\n6. f") })).rejects.toThrow();
    await setPlan(db, alice.id, "pro");
    await expect(createProject(db, alice.id, { title: "P2", ...files("1. a point") })).resolves.toBeTruthy();
  });
  it("deletes project, derived rows and files but keeps usage accounting", async () => {
    const { db, ai: mock, alice, project } = await demoSetup();
    const ai = { ...mock, name: "anthropic" };
    await analyzeProject(db, ai, alice.id, project.id);
    await deleteProject(db, nullStorage, alice.id, project.id);
    for (const t of ["projects", "documents", "reviewers", "reviewer_comments", "comment_analyses", "revision_items"] as const) {
      expect((await db.find(t)).filter((r) => (r as { project_id?: string }).project_id === project.id || r.id === project.id)).toHaveLength(0);
    }
    expect(nullStorage.removed).toContain(`${alice.id}/${project.id}`);
    expect(await tokensUsedThisMonth(db, alice.id)).toBeGreaterThan(0);
  });
});

describe("billing", () => {
  const secret = "whsec_test";
  const sign = (body: string, ts = Math.floor(Date.now() / 1000)) => `ts=${ts};h1=${createHmac("sha256", secret).update(`${ts}:${body}`).digest("hex")}`;
  it("verifies Paddle signatures and rejects tampering/replay", () => {
    const body = '{"a":1}';
    expect(verifyPaddleSignature(body, sign(body), secret)).toBe(true);
    expect(verifyPaddleSignature(body + " ", sign(body), secret)).toBe(false);
    expect(verifyPaddleSignature(body, sign(body, 1000), secret)).toBe(false);
    expect(verifyPaddleSignature(body, null, secret)).toBe(false);
  });
  it("applies webhook events to subscriptions", async () => {
    const { db, alice } = await setup();
    const evt = { event_type: "subscription.created", data: { id: "sub_1", customer_id: "ctm_1", custom_data: { user_id: alice.id, plan: "pro" } } };
    expect(await applyPaddleEvent(db, evt)).toBe(true);
    expect((await getSubscription(db, alice.id)).plan).toBe("pro");
    await applyPaddleEvent(db, { ...evt, event_type: "subscription.canceled" });
    expect((await getSubscription(db, alice.id)).plan).toBe("free");
    expect(await applyPaddleEvent(db, { event_type: "subscription.created", data: { custom_data: { user_id: alice.id, plan: "admin" } } })).toBe(false);
  });
});

describe("usage tracking per user and per plan", () => {
  it("records the plan with each event and summarises the month by plan", async () => {
    const { db, ai: mock, alice, bob, project } = await demoSetup();
    const ai = { ...mock, name: "anthropic" };
    await analyzeProject(db, ai, alice.id, project.id);
    await setPlan(db, alice.id, "pro");
    await analyzeProject(db, ai, alice.id, project.id, { force: true });
    const s = await getUsageSummary(db, alice.id);
    expect(s.plan).toBe("pro");
    expect(s.analyses).toBe(12);
    expect(s.byPlan.map((b) => b.plan).sort()).toEqual(["free", "pro"]);
    expect(s.byPlan.find((b) => b.plan === "free")!.analyses).toBe(6);
    expect(s.tokens.used).toBe(s.tokens.input + s.tokens.output);
    expect(s.projects).toEqual({ used: 0, limit: 10 }); // demo projects do not count
    // usage is per user: bob has none
    expect((await getUsageSummary(db, bob.id)).analyses).toBe(0);
  });
  it("counts cache hits separately and enforces the monthly token budget for real providers only", async () => {
    const { db, ai: mock, alice, project } = await demoSetup();
    const ai = { ...mock, name: "anthropic" };
    await analyzeProject(db, ai, alice.id, project.id);
    await analyzeProject(db, ai, alice.id, project.id);
    expect((await getUsageSummary(db, alice.id)).cacheHits).toBe(6);
    // exhaust the free budget artificially, then a NON-mock provider must be refused while the mock (demo) still works
    await db.insert("usage_events", { user_id: alice.id, project_id: null, plan: "free", kind: "ai_analysis", input_tokens: 1_000_000, output_tokens: 0, meta: {} });
    await expect(analyzeProject(db, ai, alice.id, project.id, { force: true })).rejects.toThrow(/allowance/);
    await expect(analyzeProject(db, mock, alice.id, project.id, { force: true })).resolves.toBeTruthy(); // demo still works
  });
});

describe("demo analysis is free", () => {
  it("records zero tokens and is invisible in usage figures and budget", async () => {
    const { db, ai, alice, project } = await demoSetup();
    await analyzeProject(db, ai, alice.id, project.id);
    await analyzeProject(db, ai, alice.id, project.id); // cached
    const events = await db.find("usage_events", { user_id: alice.id });
    expect(events.every((e) => e.kind === "demo_analysis" && e.input_tokens === 0 && e.output_tokens === 0)).toBe(true);
    const s = await getUsageSummary(db, alice.id);
    expect(s).toMatchObject({ analyses: 0, cacheHits: 0 });
    expect(s.tokens.used).toBe(0);
  });
});

describe("rollback and deletion order", () => {
  it("deleteProjectRows removes rows without touching storage (used to roll back failed uploads)", async () => {
    const { db, alice, project } = await demoSetup();
    await deleteProjectRows(db, alice.id, project.id);
    expect(await db.get("projects", project.id)).toBeNull();
  });
  it("deleteProject fails without deleting anything when storage is down", async () => {
    const { db, alice, project } = await demoSetup();
    const down = { ...nullStorage, removePrefix: async () => { throw new Error("storage down"); } };
    await expect(deleteProject(db, down, alice.id, project.id)).rejects.toThrow(/storage down/);
    expect(await db.get("projects", project.id)).not.toBeNull();
  });
});
