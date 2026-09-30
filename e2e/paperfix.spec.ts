import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import { Document, Packer, Paragraph } from "docx";
import mammoth from "mammoth";
import { PostgresDb } from "../src/core/db/postgres";
import { S3Storage } from "../src/core/storage";
import { MANUSCRIPT, aiCount, aiMode, aiReset, createProjectFromText, signIn, signOut, signUpVerified, uniqueEmail } from "./helpers";

const db = new PostgresDb({ connectionString: "postgres://postgres@127.0.0.1:54322/postgres", max: 2 });
const s3 = new S3Storage("manuscripts", { endpoint: "http://127.0.0.1:54323", region: "us-east-1", accessKeyId: "S3RVER", secretAccessKey: "S3RVER", forcePathStyle: true });
test.afterAll(() => db.close());
test.beforeEach(async ({ request }) => { await aiReset(request); await aiMode(request, "ok"); });

const cards = (page: Page) => page.locator("[id^=c-]");

test("demo project works end to end and never calls the AI API", async ({ page, request }) => {
  await signUpVerified(page, request);
  await page.getByRole("button", { name: "Open demo project" }).click();
  await page.waitForURL("**/workspace");
  expect(await aiCount(request)).toBe(0); // demo analysis is offline: zero tokens spent

  await expect(page.getByText("AUTHOR INPUT REQUIRED").first()).toBeVisible();
  const body = await page.locator("body").innerText();
  expect(body).toMatch(/allocated or assigned to groups/i);
  expect(body).not.toMatch(/randomly assigned|coin flip|sealed/i);
  await expect(page.getByText("Reviewer 1 · Comment 1")).toBeVisible();

  // supply the missing information => that comment no longer needs input and uses the author's exact words
  const first = cards(page).first();
  await first.locator("textarea[name=content]").fill("Students were allocated using a sealed-envelope draw prepared by a third party.");
  await first.getByRole("button", { name: /Submit & re-analyse/ }).click();
  await expect(page.getByText("sealed-envelope draw").first()).toBeVisible();

  await cards(page).first().getByRole("button", { name: "Accept", exact: true }).click();
  await expect(cards(page).first().getByText("accepted", { exact: true })).toBeVisible();
  await cards(page).first().getByRole("button", { name: "Resolve" }).click();
  await expect(cards(page).first().getByText("Resolved").first()).toBeVisible();
  await cards(page).nth(1).getByText("Edit", { exact: true }).click();
  await cards(page).nth(1).locator("textarea[name=text]").fill("My own edited proposal.");
  await cards(page).nth(1).getByRole("button", { name: "Save edit" }).click();
  await expect(page.getByText("My own edited proposal.").first()).toBeVisible();
  await cards(page).nth(2).getByRole("button", { name: "Reject" }).click();
  await expect(cards(page).nth(2).getByText("rejected", { exact: true })).toBeVisible();

  await page.selectOption("#f-status", "needs_author_input");
  await page.getByRole("button", { name: "Filter" }).click();
  await expect(page).toHaveURL(/status=needs_author_input/);
  expect(await cards(page).count()).toBeGreaterThan(0);

  const pid = page.url().match(/projects\/([0-9a-f-]{36})/)![1];
  await page.goto(`/projects/${pid}/response`);
  await page.getByRole("button", { name: /Generate response|Refresh from workspace/ }).click();
  await expect(page.getByText(/Response entries updated/)).toBeVisible(); // wait for the action to finish before editing
  await page.locator("textarea[name=author_response]").first().fill("Edited reply from the author.");
  await page.getByRole("button", { name: "Save", exact: true }).first().click();
  await expect(page.getByText("Edited by you").first()).toBeVisible();

  // exports
  await page.goto(`/projects/${pid}/export`);
  const get = async (kind: string) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.locator(`a[href$="/download/${kind}"]`).click()]);
    const p = test.info().outputPath(`out-${kind}`);
    await dl.saveAs(p);
    return { path: p, name: dl.suggestedFilename(), buf: fs.readFileSync(p) };
  };
  const resp = await get("response");
  expect(resp.name).toBe("response-to-reviewers.docx");
  const respText = (await mammoth.extractRawText({ buffer: resp.buf })).value;
  expect(respText).toContain("Reviewer 2");
  expect(respText).toContain("Edited reply from the author.");
  expect(respText).toContain("sealed-envelope draw");
  const rep = await get("report");
  expect((await mammoth.extractRawText({ buffer: rep.buf })).value).toContain("Revision Report");
  const json = JSON.parse((await get("json")).buf.toString());
  expect(json.reviewers).toHaveLength(2);
  expect(JSON.stringify(json)).not.toContain("input_hash");
  expect(await aiCount(request)).toBe(0);

  // demo usage does not spend the real allowance
  await page.goto("/account");
  await expect(page.getByTestId("usage-analyses")).toHaveText("0");
});

test("real-AI path: analysis, caching, per-comment re-analysis and usage tracking", async ({ page, request }) => {
  await signUpVerified(page, request);
  await createProjectFromText(page, "Real AI project");
  await page.getByRole("button", { name: "Analyse comments" }).click();
  await page.waitForURL(/analysis/);
  await expect(page.getByText("Analysed 2 comment(s), 0 unchanged")).toBeVisible();
  expect(await aiCount(request)).toBe(2);
  await expect(page.getByText("AUTHOR INPUT REQUIRED").first()).toBeVisible();
  await expect(page.getByText("Offline heuristic analysis")).toHaveCount(0); // this is the anthropic provider path

  // same inputs => served from cache, zero API calls
  await page.getByRole("button", { name: /Re-run/ }).click();
  await expect(page.getByText("Analysed 0 comment(s), 2 unchanged")).toBeVisible();
  expect(await aiCount(request)).toBe(2);

  // author input re-analyses only that comment (one more call)
  await page.goto(page.url().replace("/analysis", "/workspace"));
  await cards(page).first().locator("textarea[name=content]").fill("We sampled students by convenience via a poster; allocation was by sealed envelope.");
  await cards(page).first().getByRole("button", { name: /Submit & re-analyse/ }).click();
  await expect(page.getByText("sealed envelope").first()).toBeVisible();
  expect(await aiCount(request)).toBe(3);

  await page.goto("/account");
  await expect(page.getByTestId("usage-analyses")).toHaveText("3");
  await expect(page.getByTestId("usage-cache")).toHaveText("2");
  await expect(page.getByRole("progressbar")).toBeVisible();
  await expect(page.getByText(/Free: 3 analyses|AI allowance/).first()).toBeVisible();
});

test("file upload is stored privately, validated, and removed with the project", async ({ page, request }) => {
  await signUpVerified(page, request);
  const docx = Buffer.from(await Packer.toBuffer(new Document({ sections: [{ children: MANUSCRIPT.split("\n").map((l) => new Paragraph(l)) }] })));

  // invalid files are rejected with a friendly message and create nothing
  await page.goto("/projects/new");
  await page.fill("#title", "Bad upload");
  await page.setInputFiles("#manuscript_file", { name: "evil.pdf", mimeType: "application/pdf", buffer: Buffer.from("MZ not really a pdf") });
  await page.fill("#comments_text", "1. A point");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText("This file is not a valid PDF")).toBeVisible();

  await page.goto("/projects/new");
  await page.fill("#title", "Uploaded manuscript ../../x");
  await page.setInputFiles("#manuscript_file", { name: "../../My Paper (final).docx", mimeType: "application/octet-stream", buffer: docx });
  await page.fill("#comments_text", "Reviewer 1\n1. Please describe the recruitment.");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/projects\/[0-9a-f-]{36}$/);
  const pid = page.url().match(/projects\/([0-9a-f-]{36})/)![1];
  await expect(page.getByText("Methods").first()).toBeVisible(); // sections detected from the DOCX

  const project = (await db.get("projects", pid))!;
  const docs = await db.find("documents", { project_id: pid });
  const ms = docs.find((d) => d.type === "manuscript")!;
  expect(ms.storage_path).toBe(`${project.user_id}/${pid}/manuscript-My_Paper_final.docx`); // sanitised, namespaced per user/project
  expect(Buffer.compare(await s3.get(ms.storage_path!), docx)).toBe(0); // the original bytes are in the private bucket
  expect(ms.extracted_text).toContain("forty students");

  const openDelete = async () => {
    if (!(await page.locator("#delete").evaluate((d) => (d as HTMLDetailsElement).open))) await page.getByText("Delete project and its files").click();
  };
  await openDelete();
  await page.fill("#confirm", "nope");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("Type DELETE to confirm")).toBeVisible();
  expect(await db.get("projects", pid)).not.toBeNull();
  await openDelete();
  await page.fill("#confirm", "DELETE");
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await page.waitForURL("**/dashboard**");
  await expect(page.getByText("Project and its files were deleted")).toBeVisible();
  expect(await db.get("projects", pid)).toBeNull();
  await expect(s3.get(ms.storage_path!)).rejects.toThrow(); // file gone from storage too
  await page.goto(`/projects/${pid}`);
  await expect(page.getByText(/could not be found|404/i).first()).toBeVisible();
});

test("tenant isolation: another user cannot open, export or modify a project", async ({ browser, page, request }) => {
  await signUpVerified(page, request);
  const pid = await createProjectFromText(page, "Private project");
  const other = await browser.newContext();
  const p2 = await other.newPage();
  await signUpVerified(p2, request, uniqueEmail("intruder"));
  for (const path of ["", "/analysis", "/workspace", "/response", "/export"]) {
    const res = await p2.goto(`/projects/${pid}${path}`);
    expect(res?.status()).toBe(404);
  }
  for (const kind of ["report", "response", "json"]) {
    // fetch from inside the browser so the (Secure, httpOnly) session cookies are sent exactly like a real user's request
    const status = await p2.evaluate(async (u) => (await fetch(u)).status, `/projects/${pid}/download/${kind}`);
    expect(status).toBe(404);
  }
  await p2.goto("/dashboard");
  await expect(p2.getByText("Private project")).toHaveCount(0);
  await other.close();
});

test("plan limits, dev-mode upgrade and usage are enforced per user", async ({ page, request }) => {
  await signUpVerified(page, request);
  await createProjectFromText(page, "First");
  await page.goto("/projects/new");
  await page.fill("#title", "Second");
  await page.fill("#manuscript_text", MANUSCRIPT);
  await page.fill("#comments_text", "1. A point");
  await page.getByRole("button", { name: "Create project" }).click();
  await expect(page.getByText(/allows 1 project/)).toBeVisible();

  await page.goto("/account");
  await page.getByRole("button", { name: "Switch (dev mode)" }).nth(1).click(); // Researcher Pro
  await expect(page.getByText("Plan updated.")).toBeVisible();
  await expect(page.getByText(/Researcher Pro \(active\)/)).toBeVisible();
  await page.goto("/projects/new");
  await page.fill("#title", "Second");
  await page.fill("#manuscript_text", MANUSCRIPT);
  await page.fill("#comments_text", "1. A point");
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/projects\/[0-9a-f-]{36}$/);
});

test("mobile layout has no horizontal overflow on key pages", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  for (const path of ["/", "/pricing", "/signin", "/signup", "/privacy"]) {
    await page.goto(path);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), path).toBe(false);
  }
  const email = await signUpVerified(page, request);
  await page.getByRole("button", { name: "Open demo project" }).click();
  await page.waitForURL("**/workspace");
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
  await signOut(page);
  await signIn(page, email);
  await page.waitForURL("**/dashboard");
});
