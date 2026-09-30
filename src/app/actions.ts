"use server";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { signIn, signUp } from "@/core/auth/accounts";
import { endSession, startSession } from "@/core/auth/session";
import { getDb } from "@/core/db";
import { rateLimit } from "@/core/ratelimit";
import { AppError } from "@/core/errors";
import { track } from "@/core/analytics";
import { getEmail } from "@/core/email";
import { fail } from "@/lib/flash";

async function guard(kind: string) {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  if (!rateLimit(`${kind}:${ip}`, 10, 60_000)) throw new AppError("Too many attempts. Please wait a minute and try again.", 429);
}

export async function signUpAction(form: FormData) {
  try {
    await guard("signup");
    const email = String(form.get("email") ?? "");
    const user = await signUp(getDb(), { email, password: String(form.get("password") ?? ""), name: String(form.get("name") ?? "") });
    await startSession(user.id);
    track("signup_completed", user.id);
    await getEmail().send({ to: email, subject: "Welcome to ScholarOS PaperFix", text: "Your account is ready." });
  } catch (e) {
    fail("/signup", e);
  }
  redirect("/dashboard");
}

export async function signInAction(form: FormData) {
  try {
    await guard("signin");
    const user = await signIn(getDb(), { email: String(form.get("email") ?? ""), password: String(form.get("password") ?? "") });
    await startSession(user.id);
  } catch (e) {
    fail("/signin", e);
  }
  redirect("/dashboard");
}

export async function signOutAction() {
  await endSession();
  redirect("/");
}
