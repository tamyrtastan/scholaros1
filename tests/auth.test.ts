import { describe, expect, it } from "vitest";
import type { AuthError } from "@supabase/supabase-js";
import { isAuthUnavailable } from "@/core/auth/session";
import { toAppError } from "@/core/auth/messages";
import { hardenCookie } from "@/core/auth/supabase";
import { AppError, ServiceUnavailableError, isConnectivityError, safeMessage } from "@/core/errors";
import { rateLimit } from "@/core/ratelimit";
import { getSubscription } from "@/core/billing/entitlements";
import { makeUser, setup } from "./helpers";

const err = (p: Partial<AuthError>) => ({ name: "AuthApiError", message: "x", status: 400, ...p }) as AuthError;

describe("auth error handling", () => {
  it("distinguishes 'auth service down' from 'not signed in'", () => {
    expect(isAuthUnavailable(err({ name: "AuthRetryableFetchError", status: 0 }))).toBe(true);
    expect(isAuthUnavailable(err({ status: 503 }))).toBe(true);
    expect(isAuthUnavailable(err({ name: "AuthApiError", status: undefined, message: "fetch failed" }))).toBe(true);
    expect(isAuthUnavailable(err({ name: "AuthSessionMissingError", status: 400 }))).toBe(false);
    expect(isAuthUnavailable(err({ status: 401, message: "invalid JWT" }))).toBe(false);
  });
  it("maps provider errors to safe messages without leaking details", () => {
    expect(toAppError(err({ code: "invalid_credentials", message: "Invalid login credentials" })).message).toBe("Incorrect email or password");
    expect(toAppError(err({ code: "email_not_confirmed" })).message).toMatch(/verify your email/i);
    expect(toAppError(err({ code: "over_email_send_rate_limit", status: 429 })).status).toBe(429);
    expect(toAppError(err({ code: "otp_expired" })).message).toMatch(/expired/);
    expect(toAppError(err({ code: "some_unknown_code", message: "secret internal detail" })).message).not.toMatch(/secret/);
    expect(toAppError(err({ name: "AuthRetryableFetchError", status: 0 }))).toBeInstanceOf(ServiceUnavailableError);
  });
  it("hardens session cookies: httpOnly, sameSite, path", () => {
    expect(hardenCookie({ maxAge: 10, httpOnly: false })).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/", maxAge: 10 });
  });
  it("never shows raw errors to users", () => {
    expect(safeMessage(new Error("password=hunter2 at db"))).toBe("Something went wrong. Please try again.");
    expect(safeMessage(new AppError("Visible"))).toBe("Visible");
    expect(safeMessage(new ServiceUnavailableError("database"))).toMatch(/temporarily unavailable/);
  });
  it("recognises connectivity failures", () => {
    expect(isConnectivityError({ code: "ECONNREFUSED" })).toBe(true);
    expect(isConnectivityError({ code: "57P01" })).toBe(true);
    expect(isConnectivityError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isConnectivityError(new Error("syntax error"))).toBe(false);
  });
});

describe("account bootstrap", () => {
  it("each user has their own free subscription", async () => {
    const { db, alice, bob } = await setup();
    expect((await getSubscription(db, alice.id)).plan).toBe("free");
    const carol = await makeUser(db, "carol@example.com");
    expect((await getSubscription(db, carol.id)).user_id).toBe(carol.id);
    expect((await getSubscription(db, bob.id)).user_id).not.toBe(alice.id);
  });
});

describe("rate limit", () => {
  it("blocks after the limit and resets after the window", () => {
    expect([1, 2, 3].map(() => rateLimit("k", 2, 1000, 0))).toEqual([true, true, false]);
    expect(rateLimit("k", 2, 1000, 2000)).toBe(true);
  });
});
