"use client";
// App frame. Signed out: logo + "Log in" only (no menus).
// Signed in: menus grouped into Work / Analyze / Govern dropdowns in the top bar + Profile on the right.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { NAV_GROUPS, canOpen, navFor, type NavItem } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { LoginMenu, ProfileMenu } from "./account";
import { Logo } from "./brand";

function isActive(path: string, href: string) {
  return path.startsWith(href) || (href === "/queue" && path.startsWith("/cases"));
}

function GroupMenu({ group, items, path, alignRight = false }: { group: string; items: NavItem[]; path: string; alignRight?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const active = items.find((n) => isActive(path, n.href));

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
          active ? "bg-white/15 font-semibold text-white shadow-[inset_0_-2px_0_#d03027]" : "text-white/85 hover:bg-white/10 hover:text-white"
        }`}
      >
        {group}
        {active && <span className="hidden font-normal text-white/70 xl:inline">· {active.label}</span>}
        <svg viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true">
          <path d="M2.5 4.5L6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <div role="menu" className={`absolute ${alignRight ? "right-0 md:left-0 md:right-auto" : "left-0"} z-40 mt-2 w-64 max-w-[calc(100vw-2rem)] md:w-72 rounded-lg border border-line bg-white p-1.5 text-ink shadow-xl`}>
          {items.map((n) => {
            const on = isActive(path, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                role="menuitem"
                aria-current={on ? "page" : undefined}
                className={`block rounded-md px-3 py-2 ${on ? "bg-navy-light" : "hover:bg-canvas"}`}
              >
                <div className={`text-sm ${on ? "font-semibold text-navy" : "font-medium text-navy-dark"}`}>{n.label}</div>
                <div className="text-xs text-muted">{n.hint}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, ready } = useAuth();
  const isLanding = path === "/";

  // Signed-out visitors can only see the landing page.
  useEffect(() => {
    if (ready && !user && !isLanding) router.replace("/");
  }, [ready, user, isLanding, router]);

  const nav = ready && user ? navFor(user.role) : [];
  const groups = NAV_GROUPS.map((g) => ({ g, items: nav.filter((n) => n.group === g) })).filter((x) => x.items.length);

  const header = (
    <header className="relative z-30 bg-navy text-white print:bg-white print:text-navy">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 md:flex-nowrap md:gap-6 md:px-6 print:px-0">
        <Link href="/" aria-label="TriageIQ home" className="shrink-0">
          <Logo light />
        </Link>
        {groups.length > 0 && (
          <nav aria-label="Main" className="order-last flex w-full min-w-0 items-center gap-1 md:order-none md:w-auto md:flex-1 print:hidden">
            {groups.map(({ g, items }, i) => (
              <GroupMenu key={g} group={g} items={items} path={path} alignRight={i === groups.length - 1} />
            ))}
          </nav>
        )}
        <div className="ml-auto shrink-0 print:hidden">{ready && (user ? <ProfileMenu /> : <LoginMenu />)}</div>
      </div>
    </header>
  );

  const footer = (
    <footer className="border-t border-line bg-white px-6 py-3 text-xs text-muted print:hidden">
      Student prototype for GWU ISTM 6227. Capital One is used as a public case study; this site is not affiliated with or
      endorsed by Capital One. Uses public CFPB complaint data only. AI outputs are drafts that require human review.
    </footer>
  );

  if (!ready) {
    return <div className="flex min-h-screen flex-col">{header}<main className="flex-1" />{footer}</div>;
  }

  if (!user || isLanding) {
    return (
      <div className="flex min-h-screen flex-col">
        {header}
        <main className="flex-1">{user || isLanding ? children : null}</main>
        {footer}
      </div>
    );
  }

  const allowed = canOpen(path, user.role);
  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 py-6 md:px-8 print:px-0 print:py-0">
        {allowed ? (
          children
        ) : (
          <div className="rounded-lg border border-line bg-white p-6">
            <h1 className="text-lg font-semibold text-navy-dark">You don&apos;t have access to this page</h1>
            <p className="mt-1 text-sm text-muted">
              Your role ({user.role_label}) can&apos;t open this section. Pick a page from the menu, or ask an administrator.
            </p>
          </div>
        )}
      </main>
      {footer}
    </div>
  );
}
