import type { Metadata } from "next";
import { AuthForm } from "@/components/auth-form";
import { signUpAction } from "@/app/actions";

export const metadata: Metadata = { title: "Sign up" };

export default async function Page({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  return <AuthForm mode="signup" action={signUpAction} error={(await searchParams).error} />;
}
