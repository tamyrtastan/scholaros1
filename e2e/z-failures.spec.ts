import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PostgresDb } from "../src/core/db/postgres";
import { MANUSCRIPT, aiCount, aiMode, aiReset, createProjectFromText, signUpVerified, svc } from "./helpers";
import { Document, Packer, Paragraph } from "docx";

// These tests stop and start real services. They run last, serially, and always restore what they break.
test.describe.configure({ mode: "serial" });

const db = new PostgresDb({ connectionString: "postgres://postgres@127.0.0.1:54322/postgres", max: 2 });
test.afterAll(() => db.close());

const health = async (request: APIRequestContext) => (await request.get("/api/health")).json();
async function waitHealthy(request: APIRequestContext) {
  await expect.poll(async () => (await health(request)).status, { timeout: 60_000, intervals: [1000] }).toBe("ok");
}
const LEAKS = /ECONNREFUSED|postgres:\/\/|127\.0\.0\.1:5|sk-|stack trace|at Object\.|supabase\.co|S3RVER|password/i;

test.beforeEach(async ({ request }) => {
  await aiReset(request);
  await aiMode(request, "ok");
});
test.afterEach(async ({ request }) => {
  // restore everything regardless of what the test did
  for (const s of ["postgres", "gotrue", "s3", "anthropic"] as const) await request.get(`http://127.0.0.1:54999/svc/${s}/start`).catch(() => undefined);
  await aiMode(request, "ok").catch(() => undefined);
  await waitHealthy(request).catch(() => undefined);
});

async function analyse(page: Page, id: string) {
  await page.goto(`/projects/${id}`);
  await page.getByRole("button", { name: /Analyse comments|Re-run analysis/ }).click();
  await page.waitForURL(/\/analysis/); // the action redirects here on success and on failure; wait so later steps don't race it
}

test.describe("AI provider failures", () => {
  test("outage: clear message, nothing charged, project untouched, recovers when AI returns", async ({ page, request }) => {
    await signUpVerified(page, request);
    const id = await createProjectFromText(page, "AI outage");
    await aiMode(request, "500");
    await analyse(page, id);
    await expect(page.getByText(/AI service is busy or unreachable/)).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(LEAKS);
    await page.goto("/account");
    await expect(page.getByTestId("usage-analyses")).toHaveText("0");
    await page.goto(`/projects/${id}/analysis`);
    await expect(page.getByText("No analysis yet")).toBeVisible();

    await aiMode(request, "ok");
    await analyse(page, id);
    await expect(page.getByText("Analysed 2 comment(s)")).toBeVisible();
    await page.goto("/account");
    await expect(page.getByTestId("usage-analyses")).toHaveText("2");
  });

  test("AI rate limit, bad API key and refusals are explained without leaking details", async ({ page, request }) => {
    await signUpVerified(page, request);
    const id = await createProjectFromText(page, "AI errors");
    await aiMode(request, "429");
    await analyse(page, id);
    await expect(page.getByText(/busy or unreachable/)).toBeVisible();

    await aiMode(request, "401");
    await analyse(page, id);
    await expect(page.getByText(/temporarily unavailable \(configuration issue\)/)).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(/sk-secret|x-api-key|invalid x-api-key/i);

    await aiMode(request, "refusal");
    await analyse(page, id);
    await expect(page.getByText(/declined to process this text|Run again to retry|2 failed|not charged/i).first()).toBeVisible();
  });

  test("invalid model output fails cleanly within bounded retries; a one-off glitch self-heals", async ({ page, request }) => {
    await signUpVerified(page, request);
    const id = await createProjectFromText(page, "Bad JSON");
    await aiMode(request, "bad-json");
    await aiReset(request);
    await aiMode(request, "bad-json");
    await analyse(page, id);
    await expect(page.getByText(/2 failed\. Run again to retry/)).toBeVisible();
    expect(await aiCount(request)).toBeLessThanOrEqual(4); // 2 comments x (1 try + 1 retry), never unbounded

    await aiReset(request);
    await aiMode(request, "bad-json-once");
    await analyse(page, id);
    await expect(page.getByText(/Analysed [12] comment/)).toBeVisible();
  });

  test("a hallucinating model cannot smuggle invented facts into the workspace", async ({ page, request }) => {
    await signUpVerified(page, request);
    const id = await createProjectFromText(page, "Hallucination", "Reviewer 1\n1. The sampling procedure is insufficiently described.");
    await aiMode(request, "hallucinate");
    await analyse(page, id);
    await page.goto(`/projects/${id}/workspace`);
    await expect(page.getByText("AUTHOR INPUT REQUIRED").first()).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(text).toContain('verify "4471"'); // invented approval number neutralised into a placeholder
    expect(text).toContain("could not be verified"); // fabricated supporting quote rejected
    expect(text).toMatch(/No directly relevant passage identified/); // and never shown as evidence from the manuscript
    expect(text).not.toMatch(/computer-generated sequence \(ethics approval no\. 4471\)/);
  });
});

test.describe("storage outage", () => {
  test("uploads fail cleanly and create nothing; paste-only projects still work; deletion waits for storage", async ({ page, request }) => {
    const email = await signUpVerified(page, request);
    // several projects are needed here, so put this test user on Pro (plan limits are covered in paperfix.spec.ts)
    await db.pool.query("update subscriptions set plan = 'pro' where user_id = (select id from auth.users where email = $1)", [email]);
    const docx = Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: MANUSCRIPT.split("\n").map((l) => new Paragraph(l)) }] })));

    // a project with a stored file, created while storage is healthy
    await page.goto("/projects/new");
    await page.fill("#title", "Has a file");
    await page.setInputFiles("#manuscript_file", { name: "paper.docx", mimeType: "application/octet-stream", buffer: docx });
    await page.fill("#comments_text", "1. A point about methods here");
    await page.getByRole("button", { name: "Create project" }).click();
    await page.waitForURL(/projects\/[0-9a-f-]{36}$/);
    const fileProject = page.url().match(/projects\/([0-9a-f-]{36})/)![1];

    await svc(request, "s3", "stop");
    expect((await health(request)).storage).toBe("down");
    expect((await request.get("/api/health")).status()).toBe(503);

    // upload while storage is down: friendly error, no half-created project
    const before = (await db.find("projects")).length;
    await page.goto("/projects/new");
    await page.fill("#title", "Cannot store");
    await page.setInputFiles("#manuscript_file", { name: "paper.docx", mimeType: "application/octet-stream", buffer: docx });
    await page.fill("#comments_text", "1. Another point about methods");
    await page.getByRole("button", { name: "Create project" }).click();
    await expect(page.getByText(/storage service is temporarily unavailable/i)).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(LEAKS);
    expect((await db.find("projects")).length).toBe(before); // rolled back

    // nothing to store => still works (degraded, not down)
    const okId = await createProjectFromText(page, "Paste only during outage");
    expect(okId).toBeTruthy();

    // deletion must not silently leave confidential files behind
    await page.goto(`/projects/${fileProject}`);
    await page.getByText("Delete project and its files").click();
    await page.fill("#confirm", "DELETE");
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText(/storage service is temporarily unavailable/i)).toBeVisible();
    expect(await db.get("projects", fileProject)).not.toBeNull(); // nothing was deleted

    await svc(request, "s3", "start");
    await waitHealthy(request);
    await page.goto(`/projects/${fileProject}`);
    if (!(await page.locator("#delete").evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText("Delete project and its files").click();
    await page.fill("#confirm", "DELETE");
    await page.getByRole("button", { name: "Delete permanently" }).click();
    await expect(page.getByText("Project and its files were deleted")).toBeVisible();
    expect(await db.get("projects", fileProject)).toBeNull();
  });
});

test.describe("auth service outage", () => {
  test("public pages stay up, private pages show an outage page (not a login loop), sign-in explains, and it recovers", async ({ page, request }) => {
    await signUpVerified(page, request);
    await svc(request, "gotrue", "stop");
    expect((await health(request)).auth).toBe("down");

    const landing = await page.goto("/");
    expect(landing?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Turn peer-review comments/ })).toBeVisible();

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "We couldn't load this page" })).toBeVisible();
    await expect(page).toHaveURL(/\/dashboard/); // no redirect to /signin: the session is fine, the service is not
    expect(await page.locator("body").innerText()).not.toMatch(LEAKS);

    await page.goto("/signin");
    await page.fill("#email", "someone@example.com");
    await page.fill("#password", "whatever-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText(/auth service is temporarily unavailable/i)).toBeVisible();

    await svc(request, "gotrue", "start");
    await waitHealthy(request);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible(); // same session, still valid
  });
});

test.describe("database outage", () => {
  test("clear outage page with no leaks, health reports it, and everything recovers without a restart", async ({ page, request }) => {
    await signUpVerified(page, request);
    const id = await createProjectFromText(page, "Survives DB outage");

    await svc(request, "postgres", "stop");
    const h = await health(request);
    expect(h.database).toBe("down");
    expect((await request.get("/api/health")).status()).toBe(503);

    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "We couldn't load this page" })).toBeVisible();
    expect(await page.locator("body").innerText()).not.toMatch(LEAKS);
    const landing = await page.goto("/pricing");
    expect(landing?.status()).toBe(200);

    await svc(request, "postgres", "start");
    await waitHealthy(request);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();
    await expect(page.getByText("Survives DB outage")).toBeVisible(); // data intact
    await page.goto(`/projects/${id}`);
    await expect(page.getByText("Reviewer comments")).toBeVisible();
  });
});
