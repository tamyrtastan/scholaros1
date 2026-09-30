import { expect, type Page, type APIRequestContext } from "@playwright/test";

export const CONTROL = "http://127.0.0.1:54999";
export const PASSWORD = "correct-horse-battery";
let n = 0;
export const uniqueEmail = (p = "user") => `${p}-${Date.now()}-${n++}@example.com`;

export interface Mail { to: string; subject: string; html: string; links: string[] }

export async function mailsFor(request: APIRequestContext, to: string): Promise<Mail[]> {
  return (await request.get(`${CONTROL}/mail?to=${encodeURIComponent(to)}`)).json();
}

/** Polls the SMTP sink until a mail to `to` with a link containing `needle` arrives; returns that link. */
export async function waitForLink(request: APIRequestContext, to: string, needle: string, since = 0): Promise<string> {
  let link = "";
  await expect
    .poll(async () => {
      const ms = await mailsFor(request, to);
      const hit = ms.slice(since).flatMap((m) => m.links).filter((l) => l.includes(needle)).pop();
      link = hit ?? "";
      return link;
    }, { timeout: 20_000, message: `mail to ${to} with ${needle}` })
    .not.toBe("");
  return link;
}

export async function signUpOnly(page: Page, email: string, password = PASSWORD) {
  await page.goto("/signup");
  await page.fill("#name", "E2E User");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/check-email/);
}

/** Full signup incl. verifying the email via the real mail + confirm page. Ends on the dashboard. */
export async function signUpVerified(page: Page, request: APIRequestContext, email = uniqueEmail()) {
  await signUpOnly(page, email);
  const link = await waitForLink(request, email, "/auth/confirm");
  await page.goto(link);
  await page.getByRole("button", { name: "Confirm email" }).click();
  await page.waitForURL("**/dashboard");
  return email;
}

export async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/signin");
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await page.waitForURL("**/");
}

export const svc = async (request: APIRequestContext, name: "postgres" | "gotrue" | "s3" | "anthropic", action: "start" | "stop") => {
  const r = await request.get(`${CONTROL}/svc/${name}/${action}`);
  expect(r.ok()).toBeTruthy();
};
export const aiMode = (request: APIRequestContext, mode: string) => request.get(`${CONTROL}/anthropic/mode/${mode}`);
export const aiCount = async (request: APIRequestContext): Promise<number> => (await (await request.get(`${CONTROL}/anthropic/count`)).json()).count;
export const aiReset = (request: APIRequestContext) => request.get(`${CONTROL}/anthropic/reset`);

export const MANUSCRIPT = "Abstract\nWe studied exam stress in students.\nMethods\nWe recruited forty students by poster. Twenty used the app and twenty were controls.\nResults\nScores fell in the app group.";
export async function createProjectFromText(page: Page, title: string, comments = "Reviewer 1\n1. The sampling procedure is insufficiently described.\n2. Please add effect sizes.") {
  await page.goto("/projects/new");
  await page.fill("#title", title);
  await page.fill("#manuscript_text", MANUSCRIPT);
  await page.fill("#comments_text", comments);
  await page.getByRole("button", { name: "Create project" }).click();
  await page.waitForURL(/projects\/[0-9a-f-]{36}$/);
  return page.url().match(/projects\/([0-9a-f-]{36})/)![1];
}
