import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startFakeAnthropic } from "./support/fake-anthropic";
import { anthropicProvider, fallbackParams, modelParams } from "@/core/ai/anthropic";
import { analyzeProject, getProjectBundle } from "@/modules/paperfix/service";
import { demoSetup } from "./helpers";

let fake: Awaited<ReturnType<typeof startFakeAnthropic>>;
beforeAll(async () => {
  fake = await startFakeAnthropic();
  process.env.AI_MODEL = "claude-sonnet-5-5";
  process.env.AI_MAX_RETRIES = "1";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterAll(async () => { await fake.close(); vi.restoreAllMocks(); });
beforeEach(() => { fake.state.mode = "ok"; fake.state.requests.length = 0; fake.state.paths.length = 0; fake.state.headers.length = 0; });

const provider = () => anthropicProvider("test-key-not-real", fake.url);

describe("request shape (real Anthropic SDK against a local fake)", () => {
  it("sends model, bounded max_tokens, system prompt, thinking off + effort for sonnet-5-5, and the fallback beta", async () => {
    const r = await provider().complete({ system: "SYS", user: "<comment_id>c</comment_id><reviewer_comment>x</reviewer_comment><manuscript_excerpt>y</manuscript_excerpt>", maxTokens: 777 });
    expect(r.inputTokens).toBe(1200);
    const body = fake.state.requests[0] as Record<string, unknown>;
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", max_tokens: 777, system: "SYS", thinking: { type: "between_tools" }, output_config: { effort: "medium" }, fallbacks: "default" });
    expect(fake.state.paths[0]).toContain("/v1/messages");
    expect(String(fake.state.headers[0]["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    expect(fake.state.headers[0]["x-api-key"]).toBe("test-key-not-real");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("tool_choice");
  });
  it("model parameter policy", () => {
    expect(modelParams("claude-haiku-4-5")).toEqual({});
    expect(fallbackParams("claude-haiku-4-5")).toBeNull();
    expect(fallbackParams("claude-sonnet-5-5", { AI_REFUSAL_FALLBACK: "false" })).toBeNull();
    expect((modelParams("claude-sonnet-5-5", { AI_EFFORT: "low" }) as { output_config: { effort: string } }).output_config.effort).toBe("low");
  });
});

describe("failure handling", () => {
  it("upstream 500 and 429 become 'service unavailable' (after SDK retries), 401 becomes a configuration message without leaking the key", async () => {
    fake.state.mode = "500";
    await expect(provider().complete({ system: "s", user: "u", maxTokens: 50 })).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/busy or unreachable/) });
    expect(fake.state.requests.length).toBeGreaterThan(1); // the SDK retried before giving up
    fake.state.mode = "429";
    await expect(provider().complete({ system: "s", user: "u", maxTokens: 50 })).rejects.toMatchObject({ status: 503 });
    fake.state.mode = "401";
    const e = await provider().complete({ system: "s", user: "u", maxTokens: 50 }).catch((x) => x);
    expect(e.status).toBe(503);
    expect(e.message).not.toMatch(/sk-secret|x-api-key/);
  });
  it("unreachable server => service unavailable", async () => {
    const dead = anthropicProvider("k", "http://127.0.0.1:1");
    await expect(dead.complete({ system: "s", user: "u", maxTokens: 50 })).rejects.toMatchObject({ status: 503 });
  });
  it("a refusal surfaces as a clear, non-charging error", async () => {
    fake.state.mode = "refusal";
    await expect(provider().complete({ system: "s", user: "u", maxTokens: 50 })).rejects.toMatchObject({ status: 422 });
  });
});

describe("full analysis pipeline over the real SDK path", () => {
  it("retries invalid JSON once, then succeeds, and records real token usage", async () => {
    const { db, alice, project } = await demoSetup();
    fake.state.mode = "bad-json-once";
    const res = await analyzeProject(db, provider(), alice.id, project.id, { onlyCommentId: (await getProjectBundle(db, alice.id, project.id)).comments[0].id });
    expect(res.analyzed).toBe(1);
    const usage = (await db.find("usage_events", { user_id: alice.id })).find((e) => e.kind === "ai_analysis")!;
    expect(usage.input_tokens).toBe(2400); // two attempts x 1200
    expect(usage.meta).toMatchObject({ provider: "anthropic", attempts: 2 });
  });
  it("persistently invalid output fails cleanly after bounded retries, leaving the project untouched", async () => {
    const { db, alice, project } = await demoSetup();
    fake.state.mode = "bad-json";
    const res = await analyzeProject(db, provider(), alice.id, project.id);
    expect(res.failed).toBe(6);
    expect(res.analyzed).toBe(0);
    expect((await getProjectBundle(db, alice.id, project.id)).analyses).toHaveLength(0);
    expect(fake.state.requests.length).toBe(6 * 2); // 1 try + 1 retry per comment, never unbounded
  });
  it("AI outage with nothing analysed raises a service-unavailable error and records no usage", async () => {
    const { db, alice, project } = await demoSetup();
    fake.state.mode = "500";
    await expect(analyzeProject(db, provider(), alice.id, project.id)).rejects.toMatchObject({ status: 503 });
    expect((await db.find("usage_events", { user_id: alice.id })).length).toBe(0);
    expect((await getProjectBundle(db, alice.id, project.id)).project.status).toBe("draft");
  });
  it("GUARDRAILS HOLD on the real path: fabricated quote dropped, invented figures neutralised, input demanded", async () => {
    const { db, alice, project } = await demoSetup();
    fake.state.mode = "hallucinate";
    const b = await getProjectBundle(db, alice.id, project.id);
    const samp = b.comments.find((c) => /sampling procedure/.test(c.original_comment))!;
    await analyzeProject(db, provider(), alice.id, project.id, { onlyCommentId: samp.id });
    const after = await getProjectBundle(db, alice.id, project.id);
    const a = after.analyses[0];
    expect(a.evidence_from_manuscript).toEqual([]); // fabricated quote removed
    expect(a.author_input_required).toBe(true); // the model said "nothing missing"; the guardrails overrode it
    expect(a.confidence).toBeLessThanOrEqual(0.4);
    expect(a.suggested_revision).not.toMatch(/4471(?!")/); // the invented approval number only survives inside a verify-placeholder
    expect(a.suggested_revision).toContain("AUTHOR INPUT REQUIRED");
    expect(a.suggested_response).toContain("AUTHOR INPUT REQUIRED");
    expect(after.comments.find((c) => c.id === samp.id)!.status).toBe("needs_author_input");
  });
});
