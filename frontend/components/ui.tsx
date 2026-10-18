"use client";
// Small shared UI pieces: badges, cards, page header, loading/error states.
import type { ReactNode } from "react";
import type { Risk } from "@/lib/api";

export function RiskBadge({ level }: { level: Risk | null }) {
  if (!level) return <span className="text-xs text-muted">Not triaged</span>;
  const styles: Record<Risk, string> = {
    high: "bg-alert-light text-alert ring-alert/30",
    medium: "bg-warn-light text-warn ring-warn/30",
    low: "bg-ok-light text-ok ring-ok/30",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ${styles[level]}`}>
      {level === "high" ? "High risk" : level === "medium" ? "Medium" : "Low"}
    </span>
  );
}

export function DeadlineChip({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft === null) return <span className="text-xs text-muted">—</span>;
  const cls =
    daysLeft < 0 ? "text-alert font-semibold" : daysLeft <= 3 ? "text-warn font-semibold" : "text-ink";
  const label = daysLeft < 0 ? `${-daysLeft}d overdue` : `${daysLeft}d left`;
  return <span className={`text-sm tabular-nums ${cls}`}>{label}</span>;
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-gray-100 text-gray-700",
    awaiting_review: "bg-navy-light text-navy",
    escalated: "bg-alert-light text-alert",
    approved: "bg-ok-light text-ok",
    closed: "bg-gray-200 text-gray-700",
  };
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${map[status] ?? "bg-gray-100"}`}>
      {status.replace("_", " ")}
    </span>
  );
}

export function FlagChips({ flags }: { flags: string[] }) {
  return (
    <div className="flex flex-wrap gap-1">
      {flags.map((f) => (
        <span key={f} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-700">
          {f.replaceAll("_", " ")}
        </span>
      ))}
    </div>
  );
}

export function Card({ title, children, right }: { title?: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
      {(title || right) && (
        <div className="mb-3 flex items-center justify-between">
          {title && <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-navy-dark">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  const styles = {
    primary: "bg-navy text-white hover:bg-navy-dark",
    secondary: "border border-line bg-white text-ink hover:bg-gray-50",
    danger: "border border-alert text-alert bg-white hover:bg-alert-light",
  }[variant];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-md px-3.5 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${styles}`}
    >
      {children}
    </button>
  );
}

export function ErrorBox({ error }: { error: string }) {
  return (
    <div className="rounded-md border border-alert/40 bg-alert-light p-3 text-sm text-alert">
      Could not reach the API. Is the back end running? <span className="block text-xs opacity-80">{error}</span>
    </div>
  );
}

export function Loading() {
  return <p className="text-sm text-muted">Loading…</p>;
}
