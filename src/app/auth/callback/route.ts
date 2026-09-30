import { redirect } from "next/navigation";
import { supabaseServer } from "@/core/auth/supabase";
import { toAppError } from "@/core/auth/messages";
import { safeMessage } from "@/core/errors";

/** PKCE return path, used when a Supabase email template keeps the default {{ .ConfirmationURL }}. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const target = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (code) {
    const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if (!error) redirect(target);
    redirect(`/signin?error=${encodeURIComponent(safeMessage(toAppError(error)))}`);
  }
  redirect("/signin?error=" + encodeURIComponent("This link is invalid or has expired."));
}
