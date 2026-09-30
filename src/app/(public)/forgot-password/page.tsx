import type { Metadata } from "next";
import Link from "next/link";
import { forgotPasswordAction } from "@/app/actions";
import { Button, Card, Flash, Input, Label } from "@/components/ui";

export const metadata: Metadata = { title: "Forgot password" };

export default async function Forgot({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-semibold">Reset your password</h1>
      <p className="mt-2 text-sm text-muted">Enter your email and we&apos;ll send you a link to choose a new password.</p>
      <div className="mt-6"><Flash error={sp.error} ok={sp.sent ? "If an account exists for that email, a reset link is on its way." : undefined} /></div>
      <Card>
        <form action={forgotPasswordAction} className="space-y-4">
          <div><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required autoComplete="email" /></div>
          <Button type="submit" className="w-full">Send reset link</Button>
        </form>
      </Card>
      <p className="mt-4 text-sm text-muted"><Link href="/signin" className="text-brand underline">Back to sign in</Link></p>
    </div>
  );
}
