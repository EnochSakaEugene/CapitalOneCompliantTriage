"use client";
import { useEffect, useState } from "react";
import { Bars } from "@/components/bars";
import { Columns, Sparkline } from "@/components/charts";
import { Button, Card, ErrorBox, Loading, PageHeader, RefreshControl } from "@/components/ui";
import { api, type Emerging, type EmergingAlert, type ThemeSummary } from "@/lib/api";
import { useLive } from "@/lib/useLive";

function ThemeButton({ a }: { a: EmergingAlert }) {
  const [res, setRes] = useState<ThemeSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div className="mt-2">
      {!res && (
        <Button variant="secondary" disabled={busy} onClick={async () => {
          setBusy(true);
          try { setRes(await api.themeSummary(a.product, a.issue)); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
        }}>{busy ? "Reading complaints…" : "What are customers saying?"}</Button>
      )}
      {err && <ErrorBox error={err} />}
      {res && (
        <div className="rounded-md border border-navy/20 bg-navy-light/40 p-3 text-sm">
          <ul className="list-disc space-y-0.5 pl-4">{res.themes.map((t) => <li key={t}>{t}</li>)}</ul>
          <p className="mt-2"><span className="font-semibold">Likely root cause:</span> {res.likely_root_cause}</p>
          <p className="mt-1"><span className="font-semibold">Suggested action:</span> {res.suggested_action}</p>
          <p className="mt-1 text-xs text-muted">AI summary of {res.sample_size} recent complaints ({res.method}). Verify before acting.</p>
        </div>
      )}
    </div>
  );
}

function EmergingIssues() {
  const [e, setE] = useState<Emerging | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.emerging().then(setE).catch((x) => setErr(String(x)));
  }, []);
  if (err) return <ErrorBox error={err} />;
  if (!e) return <Loading />;
  if (!e.window) return <p className="text-sm text-muted">No dated complaints loaded.</p>;
  const w = e.window;
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        Issues whose weekly volume in the last {w.weeks} weeks ({w.recent_from} to {w.recent_to}) is at least 1.5× their average
        over the {w.baseline_weeks} weeks before. {e.note}
      </p>
      <div className="mb-4">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Complaints per week (all loaded Capital One complaints)</div>
        <Columns data={e.series.map((s) => ({ label: s.week.slice(5), value: s.count }))} height={130} />
      </div>
      {e.alerts.length === 0 ? <p className="text-sm text-muted">No issue is spiking right now.</p> : (
        <ul className="grid gap-3 md:grid-cols-2">
          {e.alerts.map((a) => (
            <li key={a.product + a.issue} className="rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs text-muted">{a.product}</div>
                  <div className="text-sm font-semibold text-navy-dark">{a.issue}</div>
                </div>
                <span className="shrink-0 rounded-full bg-alert-light px-2 py-0.5 text-xs font-semibold text-alert">↑ {a.ratio}×</span>
              </div>
              <div className="mt-2 flex items-center gap-3 text-xs text-muted">
                <Sparkline values={a.sparkline} highlightFrom={a.sparkline.length - w.weeks} />
                <span>{a.recent_weekly}/week now vs {a.baseline_weekly}/week before · {a.recent_total} in window</span>
              </div>
              <ThemeButton a={a} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export default function InsightsPage() {
  const { data: d, error, updatedAt, loading, refresh } = useLive(() => api.insights());
  if (error && !d) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const risk = d.by_risk;
  return (
    <>
      <PageHeader
        title="Insights"
        subtitle="Complaint patterns and emerging issues, for root-cause and CX teams."
        actions={<RefreshControl updatedAt={updatedAt} loading={loading} onRefresh={refresh} />}
      />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        {[
          ["Triaged", d.triaged, "text-navy-dark"],
          ["High risk", risk.high ?? 0, "text-alert"],
          ["Medium risk", risk.medium ?? 0, "text-warn"],
          ["Awaiting review", d.by_status.awaiting_review ?? 0, "text-navy"],
        ].map(([label, value, cls]) => (
          <Card key={String(label)}>
            <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
            <div className={`mt-1 text-3xl font-semibold tabular-nums ${cls}`}>{value}</div>
          </Card>
        ))}
      </div>
      <div className="mb-4">
        <Card title="Emerging issues"><EmergingIssues /></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By product (triaged)"><Bars data={d.by_product} /></Card>
        <Card title="Risk flags"><Bars data={d.flags} color="bg-alert" /></Card>
        <div className="lg:col-span-2">
          <Card title="Top product / issue combinations (triaged)"><Bars data={d.top_issues} /></Card>
        </div>
      </div>
    </>
  );
}
