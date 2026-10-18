"use client";
// App frame. Signed out: logo + "Log in" only (no menus).
// Signed in: role-filtered menus in the top navigation bar + Profile on the right.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { canOpen, navFor } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { LoginMenu, ProfileMenu } from "./account";
import { Logo } from "./brand";

function isActive(path: string, href: string) {
  return path.startsWith(href) || (href === "/queue" && path.startsWith("/cases"));
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

  const links = (cls: string) =>
    nav.map((n) => {
      const active = isActive(path, n.href);
      return (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active ? "page" : undefined}
          className={`${cls} whitespace-nowrap rounded-md px-3 py-2 text-sm transition-colors ${
            active ? "bg-white/15 font-semibold text-white shadow-[inset_0_-2px_0_#d03027]" : "text-white/80 hover:bg-white/10 hover:text-white"
          }`}
        >
          {n.label}
        </Link>
      );
    });

  const header = (
    <header className="bg-navy text-white print:bg-white print:text-navy">
      <div className="flex items-center gap-6 px-6 py-2.5 print:px-0">
        <Link href="/" aria-label="TriageIQ home" className="shrink-0">
          <Logo light />
        </Link>
        {nav.length > 0 && (
          <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-1 lg:flex print:hidden">
            {links("")}
          </nav>
        )}
        <div className="ml-auto shrink-0 print:hidden">{ready && (user ? <ProfileMenu /> : <LoginMenu />)}</div>
      </div>
      {nav.length > 0 && (
        // Narrow screens: the same menus on a second, horizontally scrollable row of the bar.
        <nav aria-label="Main (compact)" className="flex gap-1 overflow-x-auto border-t border-white/10 px-4 py-1.5 lg:hidden print:hidden">
          {links("shrink-0")}
        </nav>
      )}
    </header>
  );

  const footer = (
    <footer className="border-t border-line bg-white px-6 py-3 text-xs text-muted">
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
      <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-6 py-6 md:px-8 print:px-0">
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
