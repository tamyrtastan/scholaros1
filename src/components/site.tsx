import Link from "next/link";
import type { ReactNode } from "react";
import { ButtonLink } from "./ui";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 font-serif text-lg font-semibold text-brand">
      <span aria-hidden className="grid h-7 w-7 place-items-center rounded-md bg-brand text-sm text-white">S</span>
      ScholarOS <span className="hidden rounded bg-brand-soft px-1.5 py-0.5 font-sans text-[11px] font-medium text-brand sm:inline">PaperFix</span>
    </Link>
  );
}

export function SiteHeader({ signedIn }: { signedIn: boolean }) {
  return (
    <header className="border-b border-line bg-paper/90">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
        <Logo href={signedIn ? "/dashboard" : "/"} />
        <nav className="flex items-center gap-1 text-sm sm:gap-3">
          <Link href="/#how" className="hidden px-2 text-muted hover:text-ink sm:inline">How it works</Link>
          <Link href="/pricing" className="px-2 text-muted hover:text-ink">Pricing</Link>
          {signedIn ? (
            <ButtonLink href="/dashboard">Dashboard</ButtonLink>
          ) : (
            <>
              <Link href="/signin" className="px-2 text-muted hover:text-ink">Sign in</Link>
              <ButtonLink href="/signup">Get started</ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} ScholarOS. PaperFix never invents research data.</p>
        <div className="flex gap-4">
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
          <Link href="/pricing" className="hover:text-ink">Pricing</Link>
        </div>
      </div>
    </footer>
  );
}

export function PublicShell({ signedIn, children }: { signedIn: boolean; children: ReactNode }) {
  return (
    <>
      <SiteHeader signedIn={signedIn} />
      <main>{children}</main>
      <SiteFooter />
    </>
  );
}
