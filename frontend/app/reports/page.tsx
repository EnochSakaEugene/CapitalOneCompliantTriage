"use client";
// Weekly compliance report: one printable page (Print → Save as PDF) or Markdown download.
import { useEffect, useState, type ReactNode } from "react";
import { Button, ErrorBox, Loading } from "@/components/ui";
import { api, type WeeklyReport } from "@/lib/api";

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

function toMarkdown(r: WeeklyReport): string {
  const q = r.ai_quality;
  const lines = [
    `# TriageIQ weekly compliance report`,
    `Period: ${r.period.start} to ${r.period.end} · generated ${r.generated_at.replace("T", " ")}`,
    ``,
    `## Volume`,
    `- Triaged: ${r.volume.triaged} (new intake: ${r.volume.new_intake})`,
    `- Risk: high ${r.volume.by_risk.high ?? 0}, medium ${r.volume.by_risk.medium ?? 0}, low ${r.volume.by_risk.low ?? 0}`,
    `- Escalated to Compliance by the AI: ${r.volume.escalated_to_compliance}`,
    `- Approved: ${r.volume.approved} · Closed: ${r.volume.closed}`,
    ``,
    `## Response deadlines (now)`,
    `- Open: ${r.deadlines.open} · overdue ${r.deadlines.overdue} · due in 3 days ${r.deadlines.due_3_days} · due in 7 days ${r.deadlines.due_7_days}`,
    `- On-time response rate: ${pct(r.deadlines.on_time_rate)}`,
    ``,
    `## AI quality and safety`,
    `- Draft groundedness: ${pct(q.grounded_mean)} over ${q.drafts_checked} drafts (${q.drafts_with_unsupported} with an unsupported claim)`,
    `- Label corrections by analysts: ${q.label_corrections} of ${q.reviewed} reviewed`,
    `- Mean edit to drafts: ${pct(q.edit_ratio_mean)}`,
    `- Prompt-injection flags: ${q.prompt_injection_flags} · non-English complaints: ${q.non_english}`,
    `- AI cost: ${q.ai_cost_usd === null ? "prices not set" : `$${q.ai_cost_usd.toFixed(4)}`}`,
    ``,
    `## Risk flags`,
    ...(r.risk_flags.length ? r.risk_flags.map(([f, n]) => `- ${f.replaceAll("_", " ")}: ${n}`) : ["- none"]),
    ``,
    `## Emerging issues`,
    ...(r.emerging.length ? r.emerging.map((e) => `- ${e.product} / ${e.issue}: ${e.ratio}× baseline (${e.recent_total} recent)`) : ["- none"]),
    ``,
    `## Open high-impact risks`,
    ...(r.open_high_impact_risks.length ? r.open_high_impact_risks.map((x) => `- ${x.risk} (owner: ${x.owner}, ${x.status})`) : ["- none"]),
    ``,
    `## Human oversight`,
    `- Approvals ${r.human_oversight.approvals} · human escalations ${r.human_oversight.escalations_by_people} · closures ${r.human_oversight.closures} · logins ${r.human_oversight.logins}`,
    ``,
    `_Student prototype (GWU ISTM 6227). Capital One is a public case study; not affiliated. AI outputs require human review._`,
  ];
  return lines.join("\n");
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="break-inside-avoid border-t border-line pt-4">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md bg-canvas p-3 print:border print:border-line print:bg-white">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-xl font-semibold tabular-nums text-navy-dark">{value}</div>
    </div>
  );
}

export default function ReportsPage() {
  const [end, setEnd] = useState(iso(new Date()));
  const [r, setR] = useState<WeeklyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setR(null);
    api.weeklyReport(end).then(setR).catch((e) => setError(String(e)));
  }, [end]);

  const download = () => {
    if (!r) return;
    const url = URL.createObjectURL(new Blob([toMarkdown(r)], { type: "text/markdown" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `triageiq_weekly_${r.period.end}.md` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 print:hidden">
        <div>
          <h1 className="text-2xl font-semibold text-navy-dark">Weekly Compliance Report</h1>
          <p className="text-sm text-muted">One page for Compliance and CX leadership. Print it or save it as PDF.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">Week ending</span>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="rounded-md border border-line px-2 py-1.5" />
          </label>
          <Button variant="secondary" onClick={download} disabled={!r}>Download Markdown</Button>
          <Button onClick={() => window.print()} disabled={!r}>Print / Save as PDF</Button>
        </div>
      </div>
      {error && <ErrorBox error={error} />}
      {!r ? !error && <Loading /> : (
        <article className="space-y-4 rounded-lg border border-line bg-white p-6 shadow-sm print:border-0 print:p-0 print:shadow-none">
          <header>
            <div className="text-xs font-semibold uppercase tracking-widest text-navy">TriageIQ · Capital One case study</div>
            <h1 className="text-xl font-semibold text-navy-dark">Weekly compliance report</h1>
            <p className="text-sm text-muted">{r.period.start} to {r.period.end} · generated {r.generated_at.replace("T", " ")}</p>
          </header>
          <Section title="Volume">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Triaged" value={r.volume.triaged} />
              <Kpi label="High risk" value={r.volume.by_risk.high ?? 0} />
              <Kpi label="Escalated by AI" value={r.volume.escalated_to_compliance} />
              <Kpi label="Approved / closed" value={`${r.volume.approved} / ${r.volume.closed}`} />
            </div>
            {r.volume.by_product.length > 0 && (
              <p className="mt-2 text-sm text-gray-700">
                Top products: {r.volume.by_product.map(([p, n]) => `${p} (${n})`).join(", ")}. New complaints entered directly: {r.volume.new_intake}.
              </p>
            )}
          </Section>
          <Section title="Response deadlines (as of today)">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Open" value={r.deadlines.open} />
              <Kpi label="Overdue" value={r.deadlines.overdue} />
              <Kpi label="Due in 3 days" value={r.deadlines.due_3_days} />
              <Kpi label="On-time rate" value={pct(r.deadlines.on_time_rate)} />
            </div>
          </Section>
          <Section title="AI quality and safety">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Kpi label="Draft groundedness" value={pct(r.ai_quality.grounded_mean)} />
              <Kpi label="Drafts with unsupported claim" value={`${r.ai_quality.drafts_with_unsupported} / ${r.ai_quality.drafts_checked}`} />
              <Kpi label="Label corrections" value={`${r.ai_quality.label_corrections} / ${r.ai_quality.reviewed}`} />
              <Kpi label="Injection flags" value={r.ai_quality.prompt_injection_flags} />
            </div>
            <p className="mt-2 text-sm text-gray-700">
              Mean edit to drafts {pct(r.ai_quality.edit_ratio_mean)} · non-English complaints {r.ai_quality.non_english} · AI cost{" "}
              {r.ai_quality.ai_cost_usd === null ? "not estimated (prices not set)" : `$${r.ai_quality.ai_cost_usd.toFixed(4)}`}.
            </p>
          </Section>
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2">
            <Section title="Risk flags">
              <ul className="text-sm">
                {r.risk_flags.length ? r.risk_flags.map(([f, n]) => (
                  <li key={f} className="flex justify-between"><span>{f.replaceAll("_", " ")}</span><span className="tabular-nums">{n}</span></li>
                )) : <li className="text-muted">None</li>}
              </ul>
            </Section>
            <Section title="Emerging issues">
              <ul className="space-y-1 text-sm">
                {r.emerging.length ? r.emerging.map((e) => (
                  <li key={e.product + e.issue}><span className="font-medium">{e.issue}</span> <span className="text-muted">({e.product})</span>: {e.ratio}× baseline</li>
                )) : <li className="text-muted">None</li>}
              </ul>
            </Section>
          </div>
          <Section title="Open high-impact risks (risk register)">
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {r.open_high_impact_risks.length ? r.open_high_impact_risks.map((x) => (
                <li key={x.risk}>{x.risk} <span className="text-muted">· owner {x.owner} · {x.status}</span></li>
              )) : <li className="text-muted">None</li>}
            </ul>
          </Section>
          <Section title="Human oversight">
            <p className="text-sm">
              {r.human_oversight.approvals} approvals, {r.human_oversight.escalations_by_people} escalations by people,{" "}
              {r.human_oversight.closures} closures, {r.human_oversight.logins} logins. Every action is in the audit log.
            </p>
          </Section>
          <p className="border-t border-line pt-3 text-[11px] text-muted">
            Student prototype for GWU ISTM 6227. Capital One is a public case study; this report is not affiliated with or endorsed by
            Capital One. AI outputs require human review.
          </p>
        </article>
      )}
    </>
  );
}
