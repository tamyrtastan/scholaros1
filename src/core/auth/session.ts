import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { config } from "../config";
import { getDb } from "../db";
import type { UserRow } from "../db/types";
import { signSession, verifySession } from "./password";

const COOKIE = "scholaros_session";

export async function startSession(userId: string) {
  (await cookies()).set(COOKIE, signSession(userId, config.sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    secure: config.isProd,
    path: "/",
    maxAge: 14 * 86400,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function getCurrentUser(): Promise<UserRow | null> {
  const id = verifySession((await cookies()).get(COOKIE)?.value, config.sessionSecret);
  return id ? getDb().get("users", id) : null;
}

/** Use at the top of every authenticated page / action. */
export async function requireUser(): Promise<UserRow> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}
