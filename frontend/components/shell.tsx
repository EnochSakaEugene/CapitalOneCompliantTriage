"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ROLE_LABELS, useRole, type Role } from "./role";

const NAV = [
  { href: "/queue", label: "Triage Queue" },
  { href: "/escalations", label: "Escalations" },
  { href: "/insights", label: "Insights" },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/audit", label: "Audit Log" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const { role, setRole } = useRole();
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between bg-navy px-6 py-3 text-white print:bg-white print:px-0 print:text-navy">
        <Link href="/queue" className="flex items-baseline gap-2">
          <span className="text-lg font-bold tracking-tight">TriageIQ</span>
          <span className="text-xs text-white/70">Complaint triage assistant</span>
        </Link>
        <label className="flex items-center gap-2 text-sm print:hidden">
          <span className="text-white/70">Viewing as</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded bg-navy-dark px-2 py-1 text-white outline-none ring-1 ring-white/20"
          >
            {Object.entries(ROLE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="flex flex-1">
        <nav className="w-52 shrink-0 border-r border-line bg-white px-3 py-5 print:hidden">
          {NAV.map((n) => {
            const active = path.startsWith(n.href) || (n.href === "/queue" && path.startsWith("/cases"));
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`mb-1 block rounded-md px-3 py-2 text-sm ${
                  active ? "bg-navy-light font-semibold text-navy" : "text-ink hover:bg-gray-50"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 px-8 py-6 print:px-0">{children}</main>
      </div>
      <footer className="border-t border-line bg-white px-6 py-3 text-xs text-muted">
        Student prototype for GWU ISTM 6227. Not affiliated with or endorsed by Capital One. Uses public CFPB
        complaint data only. AI outputs are drafts that require human review.
      </footer>
    </div>
  );
}
