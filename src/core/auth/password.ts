import { scryptSync, randomBytes, timingSafeEqual, createHmac } from "node:crypto";

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = scryptSync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}

const b64 = (s: string) => Buffer.from(s).toString("base64url");
const sig = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

/** Signed, expiring session token: base64url(userId.expiryMs).hmac */
export function signSession(userId: string, secret: string, ttlMs = 14 * 86400_000, now = Date.now()): string {
  const payload = b64(`${userId}.${now + ttlMs}`);
  return `${payload}.${sig(payload, secret)}`;
}

export function verifySession(token: string | undefined, secret: string, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = Buffer.from(sig(payload, secret));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [userId, exp] = Buffer.from(payload, "base64url").toString().split(".");
  if (!userId || !exp || Number(exp) < now) return null;
  return userId;
}
