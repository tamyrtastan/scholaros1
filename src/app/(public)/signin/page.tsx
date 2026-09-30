import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signInAction } from "@/app/actions";

export const metadata: Metadata = { title: "Sign in" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <AuthForm mode="signin" action={signInAction} error={(await searchParams).error} />;
}
