import Link from "next/link";
import { Logo } from "@/components/site";
import { Button } from "@/components/ui";
import { requireUser } from "@/core/auth/session";
import { signOutAction } from "@/app/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <Logo href="/dashboard" />
          <nav className="flex items-center gap-1 text-sm sm:gap-3">
            <Link href="/dashboard" className="px-2 text-muted hover:text-ink">Projects</Link>
            <Link href="/account" className="px-2 text-muted hover:text-ink">Account</Link>
            <span className="hidden text-muted md:inline">{user.email}</span>
            <form action={signOutAction}><Button variant="ghost" type="submit">Sign out</Button></form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
