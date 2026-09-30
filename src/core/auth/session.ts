import { cache } from "react";
import { redirect } from "next/navigation";
import type { AuthError } from "@supabase/supabase-js";
import { ServiceUnavailableError } from "../errors";
import { supabaseServer } from "./supabase";

export interface AuthUser {
  id: string;
  email: string;
}

/** True when the auth backend could not answer (as opposed to "this session is not valid"). */
export function isAuthUnavailable(error: Pick<AuthError, "name" | "status" | "message">): boolean {
  if (error.name === "AuthSessionMissingError") return false;
  if (error.name === "AuthRetryableFetchError") return true;
  if (typeof error.status === "number" && error.status >= 500) return true;
  return error.status === undefined && /fetch failed|ECONN|ETIMEDOUT|network/i.test(error.message);
}

/**
 * The signed-in user, validated against Supabase Auth on every call (getUser hits the auth server,
 * it does not trust the cookie alone). Unverified emails are treated as signed out.
 * Throws ServiceUnavailableError if the auth service is down, so callers show an outage page, not a login loop.
 * Deduplicated per request.
 */
export const getCurrentUser = cache(async (): Promise<AuthUser | null> => {
  const sb = await supabaseServer();
  const { data, error } = await sb.auth.getUser();
  if (error) {
    if (isAuthUnavailable(error)) throw new ServiceUnavailableError("auth");
    return null;
  }
  const u = data.user;
  if (!u?.email || !u.email_confirmed_at) return null;
  return { id: u.id, email: u.email };
});

/** Use at the top of every authenticated page / action. */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/signin");
  return user;
}
