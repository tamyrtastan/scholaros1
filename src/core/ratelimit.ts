/**
 * Fixed-window in-memory rate limiter. Good enough for one server instance / dev.
 * On Vercel (multi-instance) swap the body for Upstash/Redis; the signature is the contract.
 */
const hits = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  h.count++;
  return h.count <= limit;
}
