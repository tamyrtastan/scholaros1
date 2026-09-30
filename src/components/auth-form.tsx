import Link from "next/link";
import { Button, Card, Input, Label, Notice } from "./ui";

export function AuthForm({ mode, action, error }: { mode: "signin" | "signup"; action: (f: FormData) => Promise<void>; error?: string }) {
  const up = mode === "signup";
  return (
    <div className="mx-auto max-w-md px-4 py-14">
      <h1 className="text-3xl font-semibold">{up ? "Create your account" : "Welcome back"}</h1>
      <p className="mt-2 text-sm text-muted">{up ? "Start free. No credit card needed." : "Sign in to continue your revision."}</p>
      <Card className="mt-6">
        <form action={action} className="space-y-4">
          {error && <Notice>{error}</Notice>}
          {up && (
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" autoComplete="name" />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" required autoComplete="email" />
          </div>
          <div>
            <Label htmlFor="password" hint={up ? "(min. 8 characters)" : undefined}>Password</Label>
            <Input id="password" name="password" type="password" required minLength={up ? 8 : 1} autoComplete={up ? "new-password" : "current-password"} />
          </div>
          <Button type="submit" className="w-full">{up ? "Create account" : "Sign in"}</Button>
        </form>
      </Card>
      <p className="mt-4 text-sm text-muted">
        {up ? (
          <>Already have an account? <Link href="/signin" className="text-brand underline">Sign in</Link></>
        ) : (
          <>New here? <Link href="/signup" className="text-brand underline">Create an account</Link></>
        )}
      </p>
      {up && <p className="mt-3 text-xs text-muted">By signing up you agree to the <Link href="/terms" className="underline">Terms</Link> and <Link href="/privacy" className="underline">Privacy Policy</Link>.</p>}
    </div>
  );
}
