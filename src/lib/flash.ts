import { redirect } from "next/navigation";
import { safeMessage } from "@/core/errors";

/** Redirects back to `path` with a safe error message (server actions must not throw raw errors to users). */
export function fail(path: string, e: unknown): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}error=${encodeURIComponent(safeMessage(e))}`);
}
