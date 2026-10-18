"use client";
// GenAI ops monitoring: quality, drift, cost and human feedback after deployment.
import Link from "next/link";
import { useEffect, useState } from "react";
import { Columns, Stat } from "@/components/charts";
import { Button, Card, ErrorBox, Loading, PageHeader, RefreshControl } from "@/components/ui";
import { api, type Correction } from "@/lib/api";
import { can } from "@/lib/access";
import { useAuth } from "@/lib/auth";
import { useLive } from "@/lib/useLive";

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

function Corrections() {
  const { user } = useAuth();
  const [data, setData] = useState<{ items: Correction[]; promoted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () => api.corrections().then(setData).catch((e) => setError(String(e)));
  useEffect(() => {
    load();
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <>
      <p className="mb-3 text-sm text-muted">
        When an analyst corrects the AI&apos;s label, the case appears here. Compliance can promote a correction so the live
        classifier sees it as an example (&ldquo;analyst corrections&rdquo; in the prompt). Promoted cases are excluded from
        evaluation samples, so measured accuracy never leaks. {data.promoted} promoted.
      </p>
      {data.items.length === 0 ? <p className="text-sm text-muted">No corrections yet. Use “AI label wrong? Correct it” on a case.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="py-2">Case</th><th>AI said</th><th>Analyst corrected to</th><th>By</th><th />
              </tr>
            </thead>
            <tbody>
              {data.items.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 align-top">
                  <td className="py-2"><Link href={`/cases/${c.id}`} className="text-navy hover:underline">{c.id}</Link></td>
                  <td className="text-muted"><div>{c.ai_product}</div><div className="text-xs">{c.ai_issue}</div></td>
                  <td><div className="font-medium">{c.product}</div><div className="text-xs">{c.issue}</div></td>
                  <td className="text-xs">{c.by}</td>
                  <td className="text-right">
                    {can.promote(user?.role) ? (
                      <Button variant="secondary" onClick={async () => {
                        await (c.promoted ? api.demote(c.id) : api.promote(c.id));
                        load();
                      }}>{c.promoted ? "Remove example" : "Promote to examples"}</Button>
                    ) : c.promoted ? <span className="text-xs text-ok">Promoted</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function MonitoringPage() {
  const [days, setDays] = useState(30);
  const live = useLive(() => api.monitoring(days), [days]);
  const m = live.data;
  const s = m?.summary;
  const series = (key: "triaged" | "grounded_mean" | "latency_ms_mean" | "escalation_rate" | "cost_usd" | "tokens") =>
    (m?.daily ?? []).map((d) => ({ label: d.day.slice(5), value: (d[key] as number | null) ?? null }));

  return (
    <>
      <PageHeader
        title="Monitoring"
        subtitle="How the AI is performing after deployment: quality, drift, speed, cost and what people correct."
        actions={
          <div className="flex items-center gap-3">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded border border-line px-2 py-1 text-sm">
              {[7, 30, 90].map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
            <RefreshControl updatedAt={live.updatedAt} loading={live.loading} onRefresh={live.refresh} />
          </div>
        }
      />
      {live.error && !m ? <ErrorBox error={live.error} /> : !m || !s ? <Loading /> : (
        <>
          {m.alerts.length > 0 && (
            <div className="mb-4 space-y-2">
              {m.alerts.map((a) => (
                <div key={a.metric} className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                  a.level === "warn" ? "border-warn/40 bg-warn-light text-warn" : "border-navy/30 bg-navy-light text-navy-dark"}`}>
                  <span aria-hidden="true">{a.level === "warn" ? "⚠" : "ℹ"}</span>
                  <span><span className="font-semibold">{a.level === "warn" ? "Warning" : "Note"}:</span> {a.message}</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Cases triaged" value={String(s.triaged ?? 0)} hint={`${s.reviewed} reviewed by people`} />
            <Stat label="Draft groundedness" value={pct(s.grounded_mean)} hint={`${pct(s.drafts_with_unsupported)} of drafts had an unsupported claim · target ≥ 85%`}
              tone={s.grounded_mean === null || s.grounded_mean === undefined ? undefined : s.grounded_mean >= 0.85 ? "ok" : "warn"} />
            <Stat label="Label override rate" value={pct(s.label_override_rate)} hint="Analyst corrected product/issue · target < 20%"
              tone={s.label_override_rate == null ? undefined : s.label_override_rate < 0.2 ? "ok" : "warn"} />
            <Stat label="Product-mix drift (PSI)" value={s.product_mix_psi == null ? "—" : String(s.product_mix_psi)}
              hint="Last 7 days vs training data · < 0.1 stable, > 0.25 shift"
              tone={s.product_mix_psi == null ? undefined : s.product_mix_psi < 0.1 ? "ok" : s.product_mix_psi < 0.25 ? "warn" : "alert"} />
            <Stat label="Avg pipeline time" value={s.latency_ms_mean ? `${(s.latency_ms_mean / 1000).toFixed(1)}s` : "—"} hint="All agents, per case" />
            <Stat label="Escalation rate" value={pct(s.escalation_rate)} hint="Routed to Compliance by the AI" />
            <Stat label="Approved unedited" value={pct(s.approve_without_edit_rate)} hint={`Mean edit ${pct(s.edit_ratio_mean)} · watch for automation bias`} />
            <Stat label="AI cost" value={s.cost_usd == null ? (m.prices_set ? "$0" : "Set prices") : `$${s.cost_usd.toFixed(3)}`}
              hint={m.prices_set ? `${s.tokens ?? 0} tokens` : "Add PRICE_* values in .env to estimate"} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card title="Cases triaged per day"><Columns data={series("triaged")} /></Card>
            <Card title="Draft groundedness per day">
              <Columns data={series("grounded_mean")} format={(v) => pct(v)} threshold={m.thresholds.grounded_mean} thresholdLabel="85% target" />
            </Card>
            <Card title="Average pipeline time per day">
              <Columns data={series("latency_ms_mean")} format={(v) => `${(v / 1000).toFixed(1)}s`} />
            </Card>
            <Card title="Escalation rate per day"><Columns data={series("escalation_rate")} format={(v) => pct(v)} /></Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card title="Languages">
              <ul className="space-y-1 text-sm">
                {Object.entries(s.languages).map(([k, v]) => (
                  <li key={k} className="flex justify-between"><span>{k === "en" ? "English" : k === "es" ? "Spanish" : k}</span><span className="tabular-nums">{v}</span></li>
                ))}
              </ul>
            </Card>
            <Card title="Safety">
              <p className="text-sm"><span className="text-2xl font-semibold tabular-nums">{s.injection_flags ?? 0}</span> prompt-injection flags in this period.</p>
              <p className="mt-1 text-xs text-muted">See Governance → Red team for how the screen is tested.</p>
            </Card>
            <Card title="What is monitored and why">
              <ul className="list-disc space-y-1 pl-4 text-xs text-gray-700">
                <li>Groundedness catches hallucinated policy claims.</li>
                <li>Override rate shows when classification quality drops.</li>
                <li>PSI drift warns when new complaints differ from the data the system was tested on.</li>
                <li>Unedited approvals flag automation bias.</li>
              </ul>
            </Card>
          </div>

          <div className="mt-4">
            <Card title="Learning from analyst corrections"><Corrections /></Card>
          </div>
        </>
      )}
    </>
  );
}
