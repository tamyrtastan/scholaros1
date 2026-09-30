import type { Metadata } from "next";
import Link from "next/link";
import { confirmEmailAction } from "@/app/actions";
import { Button, Card } from "@/components/ui";
import { Logo } from "@/components/site";

export const metadata: Metadata = { title: "Confirm", robots: { index: false } };

export default async function Confirm({ searchParams }: { searchParams: Promise<{ token_hash?: string; type?: string }> }) {
  const { token_hash, type } = await searchParams;
  const recovery = type === "recovery";
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <Logo />
      <h1 className="mt-8 text-3xl font-semibold">{recovery ? "Reset your password" : "Confirm your email"}</h1>
      {token_hash && type ? (
        <Card className="mt-6">
          <p className="text-sm text-muted">{recovery ? "Continue to choose a new password." : "One more click to verify your address and finish signing up."}</p>
          <form action={confirmEmailAction} className="mt-4">
            <input type="hidden" name="token_hash" value={token_hash} />
            <input type="hidden" name="type" value={type} />
            <Button type="submit" className="w-full">{recovery ? "Continue" : "Confirm email"}</Button>
          </form>
        </Card>
      ) : (
        <Card className="mt-6 text-sm">
          This link is incomplete. <Link href="/signin" className="text-brand underline">Go to sign in</Link>.
        </Card>
      )}
    </div>
  );
}
