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

export function safeMessage(e: unknown): string {
  if (e instanceof AppError) return e.message;
  console.error("[error]", e instanceof Error ? e.name : "unknown"); // never log payloads (manuscripts are confidential)
  return "Something went wrong. Please try again.";
}
