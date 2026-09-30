import { describe, expect, it } from "vitest";
import { hashPassword, signSession, verifyPassword, verifySession } from "@/core/auth/password";
import { signIn, signUp } from "@/core/auth/accounts";
import { LocalDb } from "@/core/db/local";
import { rateLimit } from "@/core/ratelimit";
import { setup } from "./helpers";

describe("passwords & sessions", () => {
  it("verifies correct and rejects wrong password; hashes are salted", () => {
    const h = hashPassword("hunter2hunter2");
    expect(verifyPassword("hunter2hunter2", h)).toBe(true);
    expect(verifyPassword("wrong-password", h)).toBe(false);
    expect(hashPassword("hunter2hunter2")).not.toBe(h);
  });
  it("accepts valid session, rejects tampered, expired and wrong-secret tokens", () => {
    const t = signSession("user-1", "s3cret");
    expect(verifySession(t, "s3cret")).toBe("user-1");
    expect(verifySession(t, "other")).toBeNull();
    expect(verifySession(t.slice(0, -2) + "xx", "s3cret")).toBeNull();
    expect(verifySession(signSession("u", "s3cret", 1000, 0), "s3cret", 5000)).toBeNull();
    expect(verifySession(undefined, "s3cret")).toBeNull();
  });
});

describe("accounts", () => {
  it("signs up with profile + free subscription, rejects duplicates and weak passwords", async () => {
    const { db, alice } = await setup();
    expect((await db.find("profiles", { id: alice.id })).length).toBe(1);
    expect((await db.find("subscriptions", { user_id: alice.id }))[0].plan).toBe("free");
    await expect(signUp(db, { email: "ALICE@example.com", password: "another-pass" })).rejects.toThrow(/already exists/);
    await expect(signUp(new LocalDb(null), { email: "x@y.com", password: "short" })).rejects.toThrow(/at least 8/);
  });
  it("signs in with the same error for unknown user and wrong password", async () => {
    const { db } = await setup();
    await expect(signIn(db, { email: "alice@example.com", password: "correct-horse" })).resolves.toBeTruthy();
    const e1 = await signIn(db, { email: "alice@example.com", password: "nope-nope" }).catch((e) => e.message);
    const e2 = await signIn(db, { email: "nobody@example.com", password: "nope-nope" }).catch((e) => e.message);
    expect(e1).toBe(e2);
  });
});

describe("rate limit", () => {
  it("blocks after the limit and resets after the window", () => {
    expect([1, 2, 3].map(() => rateLimit("k", 2, 1000, 0))).toEqual([true, true, false]);
    expect(rateLimit("k", 2, 1000, 2000)).toBe(true);
  });
});
