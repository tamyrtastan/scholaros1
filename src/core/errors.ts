/** Errors whose messages are safe to show to users. Anything else is reported generically. */
export class AppError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}
export class NotFoundError extends AppError {
  constructor(what = "Not found") {
    super(what, 404);
  }
}
export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource") {
    super(message, 403);
  }
}
export class LimitError extends AppError {
  constructor(message: string) {
    super(message, 402);
  }
}

/** A dependency (database, auth, storage, AI) is down or timing out. Retrying later is the right response. */
export class ServiceUnavailableError extends AppError {
  constructor(public service: "database" | "auth" | "storage" | "ai", message?: string) {
    super(message ?? `The ${service} service is temporarily unavailable. Please try again in a moment.`, 503);
  }
}

/** Network-ish failures that mean "dependency unreachable" (as opposed to a bug or bad input). */
export function isConnectivityError(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string }; name?: string; message?: string } | null;
  const codes = ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "UND_ERR_CONNECT_TIMEOUT", "UND_ERR_SOCKET"];
  const code = err?.code ?? err?.cause?.code ?? "";
  if (codes.includes(code)) return true;
  // pg: connection-class SQLSTATEs (08xxx), admin shutdown / crash (57P0x), too many connections (53300)
  if (/^(08|57P0|53300)/.test(code)) return true;
  return /timeout|terminated|Connection (terminated|refused)|fetch failed/i.test(err?.message ?? "");
}

export function safeMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  console.error("[error]", e instanceof Error ? e.name : "unknown"); // never log payloads (manuscripts are confidential)
  return "Something went wrong. Please try again.";
}
