"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/core/auth/supabase";
import { requireUser } from "@/core/auth/session";
import { toAppError } from "@/core/auth/messages";
import { config } from "@/core/config";
import { rateLimit } from "@/core/ratelimit";
import { AppError } from "@/core/errors";
import { track } from "@/core/analytics";
import { fail } from "@/lib/flash";

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email address");
const passwordSchema = z.string().min(8, "Password must be at least 8 characters").max(200);

async function guard(kind: string, extraKey?: string, keyLimit = 4, limit = config.limits.authPerMinute, windowMs = 60_000) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const ok = rateLimit(`${kind}:ip:${ip}`, limit, windowMs) && (!extraKey || rateLimit(`${kind}:key:${extraKey}`, keyLimit, 15 * 60_000));
  if (!ok) throw new AppError("Too many attempts. Please wait a few minutes and try again.", 429);
}

const parse = <T>(schema: z.ZodType<T>, v: unknown): T => {
  const r = schema.safeParse(v);
  if (!r.success) throw new AppError(r.error.issues[0].message);
  return r.data;
};
const field = (f: FormData, k: string) => String(f.get(k) ?? "");

export async function signUpAction(form: FormData) {
  let email = "";
  try {
    email = parse(emailSchema, field(form, "email"));
    const password = parse(passwordSchema, field(form, "password"));
    await guard("signup", email);
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${config.appUrl}/auth/confirm`, data: { name: field(form, "name").trim().slice(0, 100) } },
    });
    // "already registered" gets the same response as success, so the form cannot be used to probe for accounts.
    if (error && error.code !== "user_already_exists") throw toAppError(error);
    if (data?.session && data.user) {
      track("signup_completed", data.user.id); // project has email confirmation disabled
      redirect("/dashboard");
    }
  } catch (e) {
    if (isRedirect(e)) throw e;
    fail("/signup", e);
  }
  redirect(`/check-email?email=${encodeURIComponent(email)}`);
}

export async function signInAction(form: FormData) {
  try {
    const email = parse(emailSchema, field(form, "email"));
    await guard("signin", email, 10); // per-email: 10 tries / 15 min (brute-force brake)
    const sb = await supabaseServer();
    const { error } = await sb.auth.signInWithPassword({ email, password: field(form, "password") });
    if (error) throw toAppError(error);
  } catch (e) {
    fail("/signin", e);
  }
  redirect("/dashboard");
}

export async function signOutAction() {
  try {
    await (await supabaseServer()).auth.signOut();
  } catch {
    /* even if the auth server is unreachable, the local cookies are cleared by the client wrapper */
  }
  redirect("/");
}

export async function resendVerificationAction(form: FormData) {
  let email = "";
  try {
    email = parse(emailSchema, field(form, "email"));
    await guard("resend", email);
    const { error } = await (await supabaseServer()).auth.resend({ type: "signup", email, options: { emailRedirectTo: `${config.appUrl}/auth/confirm` } });
    if (error && error.code !== "user_already_exists") throw toAppError(error);
  } catch (e) {
    fail(`/check-email?email=${encodeURIComponent(email)}`, e);
  }
  redirect(`/check-email?email=${encodeURIComponent(email)}&resent=1`);
}

export async function forgotPasswordAction(form: FormData) {
  try {
    const email = parse(emailSchema, field(form, "email"));
    await guard("forgot", email);
    const { error } = await (await supabaseServer()).auth.resetPasswordForEmail(email, { redirectTo: `${config.appUrl}/auth/confirm` });
    // Unknown emails are not an error here either (no account enumeration); only infrastructure problems surface.
    if (error && (error.status ?? 0) >= 429) throw toAppError(error);
  } catch (e) {
    fail("/forgot-password", e);
  }
  redirect("/forgot-password?sent=1");
}

const OTP_TYPES = ["signup", "recovery", "email", "invite", "email_change", "magiclink"] as const;

/** Consumes the one-time token from an email link. Runs on a button press so mail scanners that prefetch links cannot burn it. */
export async function confirmEmailAction(form: FormData) {
  let type: EmailOtpType = "signup";
  try {
    type = parse(z.enum(OTP_TYPES), field(form, "type")) as EmailOtpType;
    const tokenHash = parse(z.string().min(10).max(500), field(form, "token_hash"));
    const sb = await supabaseServer();
    const { data, error } = await sb.auth.verifyOtp({ type, token_hash: tokenHash });
    if (error) throw toAppError(error);
    if (type === "signup" || type === "email") if (data.user) track("signup_completed", data.user.id);
  } catch (e) {
    fail("/signin", e);
  }
  redirect(type === "recovery" ? "/reset-password" : "/dashboard");
}

export async function resetPasswordAction(form: FormData) {
  await requireUser(); // the recovery link created a session
  try {
    const password = parse(passwordSchema, field(form, "password"));
    if (password !== field(form, "confirm")) throw new AppError("The two passwords do not match");
    const sb = await supabaseServer();
    const { error } = await sb.auth.updateUser({ password });
    if (error) throw toAppError(error);
    await sb.auth.signOut({ scope: "others" }); // other devices must sign in again
  } catch (e) {
    fail("/reset-password", e);
  }
  redirect("/dashboard?ok=" + encodeURIComponent("Your password was updated."));
}

function isRedirect(e: unknown) {
  return typeof e === "object" && e !== null && "digest" in e && String((e as { digest: unknown }).digest).startsWith("NEXT_REDIRECT");
}
