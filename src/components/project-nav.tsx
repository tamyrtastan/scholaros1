"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  ["", "Overview"],
  ["/analysis", "Analysis"],
  ["/workspace", "Revision workspace"],
  ["/response", "Response to Reviewers"],
  ["/export", "Export"],
];

export function ProjectNav({ id }: { id: string }) {
  const path = usePathname();
  return (
    <nav aria-label="Project sections" className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4">
      {tabs.map(([href, label]) => {
        const full = `/projects/${id}${href}`;
        const active = href === "" ? path === full : path.startsWith(full);
        return (
          <Link key={href} href={full} aria-current={active ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${active ? "border-brand font-medium text-brand" : "border-transparent text-muted hover:text-ink"}`}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
