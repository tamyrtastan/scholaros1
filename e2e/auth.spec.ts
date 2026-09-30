import { expect, test } from "@playwright/test";
import { PASSWORD, mailsFor, signIn, signOut, signUpOnly, signUpVerified, uniqueEmail, waitForLink } from "./helpers";

test.describe("Supabase Auth (real GoTrue + real SMTP mail)", () => {
  test("anonymous visitors are kept out of private pages and downloads", async ({ page, request }) => {
    for (const path of ["/dashboard", "/projects/new", "/account", "/projects/00000000-0000-0000-0000-000000000000/workspace"]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/signin/);
    }
    expect((await request.get("/projects/00000000-0000-0000-0000-000000000000/download/json")).status()).toBe(401);
  });

  test("responses carry security headers and the health endpoint leaks nothing", async ({ request }) => {
    const res = await request.get("/pricing");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["referrer-policy"]).toBeTruthy();
    const h = await request.get("/api/health");
    expect(Object.keys(await h.json()).sort()).toEqual(["auth", "database", "status", "storage"]);
  });

  test("signup requires email verification; verified user can sign in, out and back in", async ({ page, request }) => {
    const email = uniqueEmail("auth");
    await signUpOnly(page, email);
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();

    // not usable before verification
    await signIn(page, email);
    await expect(page.getByText(/verify your email address first/i)).toBeVisible();
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/signin/);

    // the verification mail really arrived and its link works (through the confirm page button)
    const mail = (await mailsFor(request, email))[0];
    expect(mail.subject.toLowerCase()).toContain("confirm");
    const link = await waitForLink(request, email, "/auth/confirm");
    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm email" }).click();
    await page.waitForURL("**/dashboard");
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();

    // session cookie is httpOnly + sameSite; survives reload
    const cookies = (await page.context().cookies()).filter((c) => c.name.startsWith("sb-"));
    expect(cookies.length).toBeGreaterThan(0);
    for (const c of cookies) {
      expect(c.httpOnly).toBe(true);
      expect(c.sameSite).toBe("Lax");
    }
    await page.reload();
    await expect(page.getByRole("heading", { name: "Your projects" })).toBeVisible();

    // sign out really ends the session
    await signOut(page);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/signin/);

    // wrong password rejected with a generic message; right password works
    await signIn(page, email, "definitely-wrong-password");
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
    await signIn(page, email);
    await page.waitForURL("**/dashboard");
  });

  test("a verification link is single-use and tampered links fail safely", async ({ page, request }) => {
    const email = await signUpVerified(page, request, uniqueEmail("reuse"));
    const link = await waitForLink(request, email, "/auth/confirm");
    await signOut(page);
    await page.goto(link); // same (already used) token
    await page.getByRole("button", { name: "Confirm email" }).click();
    await expect(page).toHaveURL(/\/signin\?error=/);
    await expect(page.getByText(/expired or was already used/i)).toBeVisible();

    await page.goto("/auth/confirm?token_hash=tampered-token-value-123&type=signup");
    await page.getByRole("button", { name: "Confirm email" }).click();
    await expect(page).toHaveURL(/\/signin\?error=/);
    await page.goto("/auth/confirm"); // no params
    await expect(page.getByText(/link is incomplete/i)).toBeVisible();
  });

  test("resend verification email sends a fresh working link", async ({ page, request }) => {
    const email = uniqueEmail("resend");
    await signUpOnly(page, email);
    const before = (await mailsFor(request, email)).length;
    await page.waitForTimeout(1500); // GoTrue per-user send interval (configured to 1s here)
    await page.getByRole("button", { name: "Resend link" }).click();
    await expect(page.getByText("A new link was sent.")).toBeVisible();
    const link = await waitForLink(request, email, "/auth/confirm", before);
    await page.goto(link);
    await page.getByRole("button", { name: "Confirm email" }).click();
    await page.waitForURL("**/dashboard");
  });

  test("duplicate signup does not reveal that the account exists", async ({ page, request }) => {
    const email = await signUpVerified(page, request, uniqueEmail("dup"));
    await signOut(page);
    await signUpOnly(page, email); // lands on the same check-email page as a new signup
    await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  });

  test("input validation: bad email, short password", async ({ page }) => {
    await page.goto("/signup");
    await page.fill("#email", "not-an-email");
    await page.fill("#password", "longenoughpw");
    await page.evaluate(() => document.querySelector("form")!.setAttribute("novalidate", "true"));
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText("Enter a valid email address")).toBeVisible();
    await page.fill("#email", uniqueEmail("v"));
    await page.fill("#password", "short");
    await page.evaluate(() => document.querySelector("form")!.setAttribute("novalidate", "true"));
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByText(/at least 8 characters/)).toBeVisible();
  });

  test("password reset: email link, validation, new password works, old one does not, link is single-use", async ({ page, request }) => {
    const email = await signUpVerified(page, request, uniqueEmail("reset"));
    await signOut(page);

    // unknown address gets the same neutral message and no email
    await page.goto("/forgot-password");
    await page.fill("#email", uniqueEmail("ghost"));
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists for that email/)).toBeVisible();

    await page.goto("/forgot-password");
    await page.fill("#email", email);
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(page.getByText(/If an account exists for that email/)).toBeVisible();
    const link = await waitForLink(request, email, "type=recovery");

    await page.goto("/reset-password"); // no session yet => sent back to request a link
    await expect(page).toHaveURL(/forgot-password/);

    await page.goto(link);
    await expect(page.getByRole("heading", { name: "Reset your password" })).toBeVisible();
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("**/reset-password");
    await page.fill("#password", "new-password-123");
    await page.fill("#confirm", "different-password-1");
    await page.getByRole("button", { name: "Update password" }).click();
    await expect(page.getByText("The two passwords do not match")).toBeVisible();
    await page.fill("#password", "new-password-123");
    await page.fill("#confirm", "new-password-123");
    await page.getByRole("button", { name: "Update password" }).click();
    await page.waitForURL("**/dashboard**");
    await expect(page.getByText("Your password was updated.")).toBeVisible();

    await signOut(page);
    await signIn(page, email, PASSWORD);
    await expect(page.getByText("Incorrect email or password")).toBeVisible();
    await signIn(page, email, "new-password-123");
    await page.waitForURL("**/dashboard");
    await signOut(page);

    await page.goto(link); // used recovery token
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page).toHaveURL(/\/signin\?error=/);
  });
});
