"use client";
// Deadline monitor: the CFPB expects a company response within 15 days.
import Link from "next/link";
import { useState } from "react";
import { Button, Card, ErrorBox, Loading, PageHeader, RefreshControl, RiskBadge, StatusPill } from "@/components/ui";
import { api, type DeadlineItem } from "@/lib/api";
import { useLive } from "@/lib/useLive";

const BUCKETS: { key: DeadlineItem["bucket"]; label: string; tone: string; note: string }[] = [
  { key: "overdue", label: "Overdue", tone: "border-alert/40 bg-alert-light text-alert", note: "Past the 15-day deadline" },
  { key: "due_3_days", label: "Due in 3 days", tone: "border-warn/40 bg-warn-light text-warn", note: "Act today" },
  { key: "due_7_days", label: "Due in 7 days", tone: "border-navy/30 bg-navy-light text-navy", note: "Plan this week" },
  { key: "on_track", label: "On track", tone: "border-ok/30 bg-ok-light text-ok", note: "More than 7 days left" },
];
const OFFSETS = [0, 7, 12, 16];

export default function DeadlinesPage() {
  const [offset, setOffset] = useState(0);
  const [bucket, setBucket] = useState<DeadlineItem["bucket"] | "">("");
  const [copied, setCopied] = useState(false);
  const live = useLive(() => api.deadlines(offset), [offset]);
  const d = live.data;

  const rows = d ? d.items.filter((i) => !bucket || i.bucket === bucket) : [];
  return (
    <>
      <PageHeader
        title="Response Deadlines"
        subtitle="The CFPB expects a response within 15 days. Overdue and at-risk cases first, highest risk first."
        actions={<RefreshControl updatedAt={live.updatedAt} loading={live.loading} onRefresh={live.refresh} />}
      />
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">View as of:</span>
        {OFFSETS.map((o) => (
          <button
            key={o}
            onClick={() => setOffset(o)}
            className={`rounded-full border px-3 py-1 ${offset === o ? "border-navy bg-navy text-white" : "border-line bg-white hover:border-navy"}`}
          >
            {o === 0 ? "Today" : `+${o} days`}
          </button>
        ))}
        <span className="text-xs text-muted">(demo time travel: see which open cases would become late if nobody acts)</span>
      </div>
      {live.error && !d ? <ErrorBox error={live.error} /> : !d ? <Loading /> : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {BUCKETS.map((b) => (
              <button
                key={b.key}
                onClick={() => setBucket(bucket === b.key ? "" : b.key)}
                className={`rounded-lg border p-4 text-left ${b.tone} ${bucket === b.key ? "ring-2 ring-navy/40" : ""}`}
              >
                <div className="text-3xl font-semibold tabular-nums">{d.counts[b.key]}</div>
                <div className="text-sm font-semibold">{b.label}</div>
                <div className="text-xs opacity-80">{b.note}</div>
              </button>
            ))}
          </div>
          <Card
            title="Daily summary"
            right={
              <Button variant="secondary" onClick={() => {
                navigator.clipboard?.writeText(d.summary);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}>{copied ? "Copied" : "Copy for email / chat"}</Button>
            }
          >
            <p className="text-sm">{d.summary}</p>
          </Card>
          <div className="mt-4">
            <Card title={`Open cases${bucket ? ` · ${BUCKETS.find((b) => b.key === bucket)?.label}` : ""} (${rows.length})`}>
              {rows.length === 0 ? <p className="text-sm text-muted">Nothing here.</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-line text-left text-xs uppercase text-muted">
                        <th className="py-2">Case</th><th>Risk</th><th>Product / issue</th><th>Status</th>
                        <th className="text-right">Deadline</th><th className="text-right">Days left</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b border-line last:border-0">
                          <td className="py-2"><Link href={`/cases/${r.id}`} className="text-navy hover:underline">{r.id}</Link></td>
                          <td><RiskBadge level={r.risk_level} /></td>
                          <td className="max-w-xs"><div className="truncate">{r.product}</div><div className="truncate text-xs text-muted">{r.issue}</div></td>
                          <td><StatusPill status={r.status} /></td>
                          <td className="text-right tabular-nums">{r.deadline}</td>
                          <td className={`text-right font-semibold tabular-nums ${r.days_left < 0 ? "text-alert" : r.days_left <= 3 ? "text-warn" : ""}`}>
                            {r.days_left < 0 ? `${-r.days_left} late` : r.days_left}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-3 text-xs text-muted">
                On-time response rate: {d.on_time_rate === null ? "no responses yet" : `${Math.round(d.on_time_rate * 100)}% of ${d.responded} responded cases`}.
                The clock starts when a complaint enters TriageIQ.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
