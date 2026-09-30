import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { resetPasswordAction } from "@/app/actions";
import { getCurrentUser } from "@/core/auth/session";
import { Button, Card, Flash, Input, Label } from "@/components/ui";

export const metadata: Metadata = { title: "Choose a new password", robots: { index: false } };

export default async function Reset({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!(await getCurrentUser())) redirect("/forgot-password?error=" + encodeURIComponent("Your reset link has expired. Please request a new one."));
  const sp = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-semibold">Choose a new password</h1>
      <div className="mt-6"><Flash error={sp.error} /></div>
      <Card>
        <form action={resetPasswordAction} className="space-y-4">
          <div><Label htmlFor="password" hint="(min. 8 characters)">New password</Label><Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" /></div>
          <div><Label htmlFor="confirm">Confirm new password</Label><Input id="confirm" name="confirm" type="password" required minLength={8} autoComplete="new-password" /></div>
          <Button type="submit" className="w-full">Update password</Button>
        </form>
      </Card>
    </div>
  );
}
