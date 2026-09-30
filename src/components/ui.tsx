import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");

const btn = {
  primary: "bg-brand text-white hover:bg-brand-dark",
  secondary: "border border-line bg-card text-ink hover:bg-brand-soft",
  danger: "border border-alert/40 bg-card text-alert hover:bg-alert-soft",
  ghost: "text-brand hover:bg-brand-soft",
};
const btnBase = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 cursor-pointer";

export function Button({ variant = "primary", className, ...p }: ComponentProps<"button"> & { variant?: keyof typeof btn }) {
  return <button {...p} className={cx(btnBase, btn[variant], className)} />;
}
export function ButtonLink({ variant = "primary", className, ...p }: ComponentProps<typeof Link> & { variant?: keyof typeof btn }) {
  return <Link {...p} className={cx(btnBase, btn[variant], className)} />;
}

export function Card({ className, ...p }: ComponentProps<"div">) {
  return <div {...p} className={cx("rounded-lg border border-line bg-card p-5 shadow-[0_1px_0_rgba(27,36,51,0.03)]", className)} />;
}

const tones = {
  neutral: "bg-paper text-muted border-line",
  brand: "bg-brand-soft text-brand border-brand/20",
  ok: "bg-ok-soft text-ok border-ok/20",
  warn: "bg-warn-soft text-warn border-warn/25",
  alert: "bg-alert-soft text-alert border-alert/25",
};
export function Badge({ tone = "neutral", children }: { tone?: keyof typeof tones; children: ReactNode }) {
  return <span className={cx("inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function AuthorInputBanner({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-md border border-alert/30 bg-alert-soft p-3 text-sm" role="alert">
      <p className="font-semibold tracking-wide text-alert">AUTHOR INPUT REQUIRED</p>
      <div className="mt-1 text-ink">{children}</div>
    </div>
  );
}

export function Notice({ kind = "error", children }: { kind?: "error" | "ok"; children: ReactNode }) {
  return (
    <div role={kind === "error" ? "alert" : "status"} className={cx("rounded-md border p-3 text-sm", kind === "error" ? "border-alert/30 bg-alert-soft text-alert" : "border-ok/30 bg-ok-soft text-ok")}>
      {children}
    </div>
  );
}

const field = "w-full rounded-md border border-line bg-white px-3 py-2 text-sm text-ink placeholder:text-muted/70";
export const Input = (p: ComponentProps<"input">) => <input {...p} className={cx(field, p.className)} />;
export const Textarea = (p: ComponentProps<"textarea">) => <textarea {...p} className={cx(field, "leading-relaxed", p.className)} />;
export const Select = (p: ComponentProps<"select">) => <select {...p} className={cx(field, p.className)} />;

export function Label({ children, hint, htmlFor }: { children: ReactNode; hint?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children} {hint && <span className="font-normal text-muted">{hint}</span>}
    </label>
  );
}

export function PageTitle({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export const statusTone = { open: "neutral", needs_author_input: "alert", ready: "brand", resolved: "ok" } as const;
export const statusLabel = { open: "Open", needs_author_input: "Needs author input", ready: "Ready", resolved: "Resolved" } as const;

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  return <div className="mb-4">{error ? <Notice>{error}</Notice> : <Notice kind="ok">{ok}</Notice>}</div>;
}
