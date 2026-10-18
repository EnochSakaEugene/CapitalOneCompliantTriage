"use client";
// App frame. Signed out: logo + "Log in" only (no menus). Signed in: role-filtered menus + Profile.
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { canOpen, navFor } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { LoginMenu, ProfileMenu } from "./account";
import { Logo } from "./brand";

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { user, ready } = useAuth();
  const isLanding = path === "/";

  // Signed-out visitors can only see the landing page.
  useEffect(() => {
    if (ready && !user && !isLanding) router.replace("/");
  }, [ready, user, isLanding, router]);

  const header = (
    <header className="flex items-center justify-between bg-navy px-6 py-3 text-white print:bg-white print:px-0 print:text-navy">
      <Link href="/" aria-label="TriageIQ home">
        <Logo light />
      </Link>
      <div className="print:hidden">{ready && (user ? <ProfileMenu /> : <LoginMenu />)}</div>
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

  const nav = navFor(user.role);
  const allowed = canOpen(path, user.role);
  return (
    <div className="flex min-h-screen flex-col">
      {header}
      <div className="flex flex-1">
        <nav className="w-52 shrink-0 border-r border-line bg-white px-3 py-5 print:hidden" aria-label="Main">
          {nav.map((n) => {
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
          <div className="mt-6 border-t border-line px-3 pt-3 text-xs text-muted">
            Signed in as
            <div className="font-medium text-ink">{user.full_name}</div>
            <div>{user.role_label}</div>
          </div>
        </nav>
        <main className="min-w-0 flex-1 px-8 py-6 print:px-0">
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
      </div>
      {footer}
    </div>
  );
}
