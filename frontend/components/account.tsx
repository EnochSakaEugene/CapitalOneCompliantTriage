"use client";
// Top-right account controls: "Log in" dropdown when signed out, "Profile" dropdown when signed in.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-xl border border-line bg-white p-4 text-ink shadow-xl">
      {children}
    </div>
  );
}

const input = "mt-1 w-full rounded-md border border-line px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-navy/30";

export function LoginMenu() {
  const { login } = useAuth();
  const { open, setOpen, ref } = useDropdown();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email, password);
      setOpen(false);
      setPassword("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="rounded-md bg-white px-4 py-1.5 text-sm font-semibold text-navy hover:bg-white/90"
      >
        Log in
      </button>
      {open && (
        <Panel>
          <form onSubmit={submit} className="space-y-3">
            <div className="text-sm font-semibold">Sign in to TriageIQ</div>
            <label className="block text-xs text-muted">
              Work email
              <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={input} placeholder="name@triageiq.demo" autoFocus />
            </label>
            <label className="block text-xs text-muted">
              Password
              <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
            </label>
            {error && <p className="rounded bg-alert-light px-2 py-1.5 text-xs text-alert">{error}</p>}
            <button type="submit" disabled={busy} className="w-full rounded-md bg-navy py-2 text-sm font-semibold text-white hover:bg-navy-dark disabled:opacity-50">
              {busy ? "Signing in…" : "Sign in"}
            </button>
            <p className="text-[11px] text-muted">Demo accounts only. Access is role-based and every sign-in is recorded in the audit log.</p>
          </form>
        </Panel>
      )}
    </div>
  );
}

export function ProfileMenu() {
  const { user, logout, changePassword } = useAuth();
  const { open, setOpen, ref } = useDropdown();
  const [changing, setChanging] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const initials = user.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) {
      setMsg({ ok: false, text: "New passwords don't match." });
      return;
    }
    setBusy(true);
    try {
      await changePassword(current, next);
      setMsg({ ok: true, text: "Password changed. Other sessions were signed out." });
      setChanging(false);
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full bg-white/10 py-1 pl-1 pr-3 text-sm hover:bg-white/20"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-xs font-bold text-navy">{initials}</span>
        Profile
      </button>
      {open && (
        <Panel>
          <div className="flex items-center gap-3 border-b border-line pb-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-navy text-sm font-bold text-white">{initials}</span>
            <div>
              <div className="font-semibold">{user.full_name}</div>
              <div className="text-xs text-muted">{user.role_label}</div>
            </div>
          </div>
          <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-y-1.5 text-sm">
            <dt className="text-muted">Username</dt><dd>{user.username}</dd>
            <dt className="text-muted">Email</dt><dd className="break-all">{user.email}</dd>
            <dt className="text-muted">Role</dt><dd>{user.role_label}</dd>
            <dt className="text-muted">Last login</dt><dd>{user.last_login_at ? new Date(user.last_login_at).toLocaleString() : "—"}</dd>
          </dl>
          {msg && <p className={`mt-3 rounded px-2 py-1.5 text-xs ${msg.ok ? "bg-ok-light text-ok" : "bg-alert-light text-alert"}`}>{msg.text}</p>}
          {changing ? (
            <form onSubmit={submit} className="mt-3 space-y-2 border-t border-line pt-3">
              <div className="text-sm font-semibold">Reset password</div>
              <input type="password" autoComplete="current-password" placeholder="Current password" required value={current} onChange={(e) => setCurrent(e.target.value)} className={input} />
              <input type="password" autoComplete="new-password" placeholder="New password" required value={next} onChange={(e) => setNext(e.target.value)} className={input} />
              <input type="password" autoComplete="new-password" placeholder="Confirm new password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} className={input} />
              <p className="text-[11px] text-muted">At least 10 characters with upper- and lower-case letters, a number and a symbol.</p>
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="flex-1 rounded-md bg-navy py-2 text-sm font-semibold text-white hover:bg-navy-dark disabled:opacity-50">
                  {busy ? "Saving…" : "Save password"}
                </button>
                <button type="button" onClick={() => setChanging(false)} className="rounded-md border border-line px-3 text-sm">
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div className="mt-4 flex gap-2 border-t border-line pt-3">
              <button onClick={() => { setChanging(true); setMsg(null); }} className="flex-1 rounded-md border border-line py-2 text-sm hover:bg-gray-50">
                Reset password
              </button>
              <button onClick={() => { setOpen(false); logout(); }} className="flex-1 rounded-md bg-alert py-2 text-sm font-semibold text-white hover:opacity-90">
                Log out
              </button>
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
