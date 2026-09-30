import type { Metadata } from "next";
import { resendVerificationAction } from "@/app/actions";
import { Button, Card, Flash } from "@/components/ui";

export const metadata: Metadata = { title: "Check your email" };

export default async function CheckEmail({ searchParams }: { searchParams: Promise<{ email?: string; resent?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-semibold">Check your email</h1>
      <p className="mt-2 text-sm text-muted">
        We sent a verification link{sp.email ? <> to <b className="text-ink">{sp.email}</b></> : ""}. Open it to activate your account. It can take a minute to arrive; check spam too.
      </p>
      <div className="mt-6"><Flash error={sp.error} ok={sp.resent ? "A new link was sent." : undefined} /></div>
      {sp.email && (
        <Card>
          <form action={resendVerificationAction} className="flex items-center justify-between gap-3">
            <input type="hidden" name="email" value={sp.email} />
            <span className="text-sm text-muted">Didn&apos;t get it?</span>
            <Button type="submit" variant="secondary">Resend link</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
