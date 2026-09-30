import { z } from "zod";
import type { Db } from "../db/store";
import type { UserRow } from "../db/types";
import { AppError } from "../errors";
import { hashPassword, verifyPassword } from "./password";

const creds = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address"),
  password: z.string().min(8, "Password must be at least 8 characters").max(200),
});

export async function signUp(db: Db, input: { email: string; password: string; name?: string }): Promise<UserRow> {
  const parsed = creds.safeParse(input);
  if (!parsed.success) throw new AppError(parsed.error.issues[0].message);
  const { email, password } = parsed.data;
  if ((await db.find("users", { email })).length) throw new AppError("An account with this email already exists");
  const user = await db.insert("users", { email, password_hash: hashPassword(password) });
  await db.insert("profiles", {
    id: user.id,
    display_name: input.name?.trim() || email.split("@")[0],
    institution: null,
    research_interests: [],
    locale: "en",
  });
  await db.insert("subscriptions", {
    user_id: user.id,
    plan: "free",
    status: "active",
    provider: "none",
    provider_customer_id: null,
    provider_subscription_id: null,
    project_credits: 0,
    current_period_end: null,
  });
  return user;
}

export async function signIn(db: Db, input: { email: string; password: string }): Promise<UserRow> {
  const email = input.email.trim().toLowerCase();
  const [user] = await db.find("users", { email });
  // same message for unknown email and wrong password
  if (!user || !verifyPassword(input.password, user.password_hash)) throw new AppError("Incorrect email or password");
  return user;
}
