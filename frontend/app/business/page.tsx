"use client";
// Business case: problem, value, ROI calculator (live assumptions), automation boundaries,
// roadmap and recommendation. Measured numbers come from the running system.
import { useEffect, useMemo, useState } from "react";
import { Stat } from "@/components/charts";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api, type BusinessBaseline } from "@/lib/api";

const usd = (x: number) => (Math.abs(x) >= 1e6 ? `$${(x / 1e6).toFixed(2)}M` : `$${Math.round(x).toLocaleString()}`);
const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

type Inputs = {
  volume: number;
  manualMin: number;
  aiMin: number;
  escalatedShare: number;
  hourly: number;
  aiCostPerCase: number;
  platformPerYear: number;
  implementation: number;
};

const FIELDS: { key: keyof Inputs; label: string; hint: string; step: number; unit?: string }[] = [
  { key: "volume", label: "Complaints per month", hint: "Default: Capital One complaints in the CFPB database, July 2026. Internal volume is higher.", step: 100 },
  { key: "manualMin", label: "Minutes per complaint today", hint: "Read, classify, research rules, draft (assumption to validate with the team)", step: 1 },
  { key: "aiMin", label: "Minutes with TriageIQ", hint: "Review AI output, edit, approve (assumption; measure in a pilot)", step: 1 },
  { key: "escalatedShare", label: "Share escalated to Compliance (%)", hint: "These save less time: only triage and research are automated", step: 1 },
  { key: "hourly", label: "Loaded analyst cost ($/hour)", hint: "Salary + benefits + overhead (assumption)", step: 1 },
  { key: "aiCostPerCase", label: "AI cost per complaint ($)", hint: "Model tokens; measured when prices are set in .env", step: 0.001 },
  { key: "platformPerYear", label: "Platform + support ($/year)", hint: "Hosting, monitoring, model-risk review, 0.5 FTE owner", step: 5000 },
  { key: "implementation", label: "One-time implementation ($)", hint: "Integration, security review, pilot, training", step: 10000 },
];

function compute(i: Inputs, factor = 1) {
  const perCaseSaved = Math.max(0, i.manualMin - i.aiMin) * factor;
  const esc = i.escalatedShare / 100;
  const minutesSaved = i.volume * 12 * (perCaseSaved * (1 - esc) + perCaseSaved * 0.4 * esc);
  const hours = minutesSaved / 60;
  const labor = hours * i.hourly;
  const run = i.volume * 12 * i.aiCostPerCase + i.platformPerYear;
  const net = labor - run;
  return {
    hours,
    fte: hours / 1800,
    labor,
    run,
    net,
    roi1: (net - i.implementation) / Math.max(1, i.implementation),
    paybackMonths: net > 0 ? i.implementation / (net / 12) : null,
  };
}

const AUTOMATE = [
  ["Classify product, issue and risk", "Automate (AI), human can correct", "Structured, measurable against CFPB labels"],
  ["Retrieve relevant regulations", "Automate (AI)", "Saves research time; sources shown to the reviewer"],
  ["Compute the 15-day deadline, count similar cases", "Automate (tools)", "Deterministic, no AI judgment"],
  ["Screen for prompt injection, redact PII", "Automate (rules)", "Runs before any AI call"],
  ["Draft replies for routine cases", "AI drafts, human approves", "Saves writing time; groundedness checked"],
  ["Send any reply to a customer", "Never automate", "Legal and reputational exposure; a person signs off"],
  ["Handle fraud, discrimination, servicemember, legal threats", "Human (Compliance)", "High consequence; regulatory duties"],
  ["Decide refunds, credits or account actions", "Never automate", "Requires account facts and authority"],
  ["Close a complaint", "Human only", "Accountability stays with staff"],
];

const ROADMAP = [
  { phase: "0 · Prepare", time: "Months 0–2", items: ["Model-risk review (SR 11-7 style)", "Security and privacy assessment", "Connect to internal complaint system (read-only)", "Baseline current handling time"] },
  { phase: "1 · Pilot", time: "Months 3–5", items: ["Credit card complaints only, one team", "Shadow mode first: AI output hidden, compared with analysts", "Then assist mode: analysts use drafts", "Weekly monitoring review"] },
  { phase: "2 · Expand", time: "Months 6–9", items: ["Add checking, savings and auto", "Spanish-language replies", "Promote analyst corrections into examples", "Integrate deadline alerts with case system"] },
  { phase: "3 · Scale", time: "Months 10–12", items: ["All complaint channels", "Root-cause reporting to product owners", "Quarterly re-evaluation and fairness audit", "Decide on trained classifier vs prompting at scale"] },
];

const KPIS = [
  ["Product accuracy vs CFPB labels", "≥ 85%", "Evaluation page"],
  ["Draft groundedness", "≥ 90% claims supported", "Monitoring page"],
  ["Analyst label override rate", "< 15%", "Monitoring page"],
  ["High-risk cases missed (sample audit)", "0", "Compliance audit"],
  ["Handling time per complaint", "−40% vs baseline", "Pilot time study"],
  ["On-time (15-day) response rate", "≥ 98%", "Deadlines page"],
];

export default function BusinessPage() {
  const [b, setB] = useState<BusinessBaseline | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inp, setInp] = useState<Inputs>({
    volume: 3176, manualMin: 30, aiMin: 14, escalatedShare: 30, hourly: 55, aiCostPerCase: 0.01,
    platformPerYear: 150000, implementation: 350000,
  });

  useEffect(() => {
    api.business().then((x) => {
      setB(x);
      setInp((p) => ({
        ...p,
        escalatedShare: x.escalation_rate !== null ? Math.round(x.escalation_rate * 100) : p.escalatedShare,
        aiCostPerCase: x.ai_cost_per_case_usd ?? p.aiCostPerCase,
      }));
    }).catch((e) => setError(String(e)));
  }, []);

  const scen = useMemo(() => ({ low: compute(inp, 0.5), mid: compute(inp, 1), high: compute(inp, 1.3) }), [inp]);
  const r = scen.mid;

  return (
    <>
      <PageHeader title="Business Case" subtitle="Why TriageIQ, what it is worth, what stays human, and how to roll it out." />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="The problem">
          <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
            <li>Capital One receives thousands of CFPB complaints a month, plus far more internally.</li>
            <li>Each one must be read, classified, researched against regulations and answered, usually within 15 days.</li>
            <li>High-risk cases (fraud, discrimination, servicemembers) hidden in the queue create regulatory exposure.</li>
            <li>Manual tagging is inconsistent, so root-cause trends surface late.</li>
          </ul>
        </Card>
        <Card title="Why generative + agentic AI">
          <ul className="list-disc space-y-1 pl-4 text-sm text-gray-700">
            <li>Complaints are free text: LLMs read intent and nuance that keyword rules miss (compare on the Evaluation page).</li>
            <li>Agents chain steps: classify, research rules (RAG), use tools for deadlines, draft, self-check.</li>
            <li>Drafts cite the regulation they rely on, and a hallucination check flags unsupported claims.</li>
            <li>A trained classifier is cheaper for labels alone, but cannot summarise, explain risk or draft.</li>
          </ul>
        </Card>
        <Card title="Who benefits">
          <ul className="space-y-1 text-sm text-gray-700">
            <li><span className="font-semibold">Analysts:</span> less research and typing, more judgment.</li>
            <li><span className="font-semibold">Compliance:</span> high-risk cases surfaced at once, full audit trail.</li>
            <li><span className="font-semibold">CX leaders:</span> emerging issues and root causes weekly.</li>
            <li><span className="font-semibold">Customers:</span> faster, consistent, plain-language answers.</li>
          </ul>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Measured in this prototype">
          {error ? <ErrorBox error={error} /> : !b ? <Loading /> : (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Stat label="AI time per case" value={b.ai_seconds_per_case === null ? "—" : `${b.ai_seconds_per_case}s`} hint="All agents" />
                <Stat label="Tokens per case" value={b.tokens_per_case === null ? "—" : String(b.tokens_per_case)} />
                <Stat label="AI cost per case" value={b.ai_cost_per_case_usd === null ? "Set prices" : `$${b.ai_cost_per_case_usd.toFixed(4)}`} />
                <Stat label="Best product accuracy" value={pct(b.best_eval?.product_accuracy)} hint={b.best_eval ? `${b.best_eval.variant} · n=${b.best_eval.n}` : "Run an evaluation"} />
                <Stat label="Draft groundedness" value={pct(b.grounded_mean)} hint={`Escalation ${pct(b.escalation_rate)}`} />
              </div>
              <p className="mt-2 text-xs text-muted">
                From {b.cases_measured} triaged cases{b.measured_from_live_llm ? " run with the live LLM" : " (mock mode: run with Gemini for real numbers)"}.{" "}
                {b.loaded_total} Capital One complaints loaded ({b.loaded_by_month[0]?.[0]} to {b.loaded_by_month.at(-1)?.[0]}).
              </p>
            </>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_1.1fr]">
        <Card title="ROI calculator (assumptions are editable)">
          <div className="grid gap-3 sm:grid-cols-2">
            {FIELDS.map((f) => (
              <label key={f.key} className="text-sm">
                <span className="block font-medium text-navy-dark">{f.label}</span>
                <input
                  type="number"
                  step={f.step}
                  value={inp[f.key]}
                  onChange={(e) => setInp({ ...inp, [f.key]: Number(e.target.value) })}
                  className="mt-1 w-full rounded-md border border-line px-2 py-1.5 tabular-nums"
                />
                <span className="mt-0.5 block text-[11px] leading-tight text-muted">{f.hint}</span>
              </label>
            ))}
          </div>
        </Card>
        <Card title="Result (expected case)">
          <div className="grid gap-3 sm:grid-cols-2">
            <Stat label="Analyst hours saved / year" value={Math.round(r.hours).toLocaleString()} hint={`≈ ${r.fte.toFixed(1)} full-time analysts`} />
            <Stat label="Labor value / year" value={usd(r.labor)} />
            <Stat label="AI + platform cost / year" value={usd(r.run)} />
            <Stat label="Net benefit / year" value={usd(r.net)} tone={r.net > 0 ? "ok" : "alert"} />
            <Stat label="Year-1 ROI (after implementation)" value={`${Math.round(r.roi1 * 100)}%`} tone={r.roi1 > 0 ? "ok" : "warn"} />
            <Stat label="Payback" value={r.paybackMonths === null ? "Never" : `${r.paybackMonths.toFixed(1)} months`} />
          </div>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase text-muted">
                <th className="py-1">Scenario</th><th className="text-right">Time saved</th><th className="text-right">Net / year</th><th className="text-right">Payback</th>
              </tr>
            </thead>
            <tbody>
              {([["Conservative", scen.low, "50%"], ["Expected", scen.mid, "100%"], ["Optimistic", scen.high, "130%"]] as const).map(([n, s, f]) => (
                <tr key={n} className="border-b border-line last:border-0">
                  <td className="py-1.5">{n} <span className="text-xs text-muted">({f} of assumed saving)</span></td>
                  <td className="text-right tabular-nums">{Math.round(s.hours).toLocaleString()} h</td>
                  <td className={`text-right tabular-nums ${s.net < 0 ? "text-alert" : ""}`}>{usd(s.net)}</td>
                  <td className="text-right tabular-nums">{s.paybackMonths === null ? "—" : `${s.paybackMonths.toFixed(1)} mo`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted">
            Time savings are assumptions until a pilot time study measures them. Not included: avoided regulatory penalties,
            faster root-cause fixes, and customer retention, which may matter more than labor savings.
          </p>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="What to automate, and what not to">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-xs uppercase text-muted"><th className="py-2">Task</th><th>Decision</th><th>Why</th></tr>
              </thead>
              <tbody>
                {AUTOMATE.map(([task, d, why]) => (
                  <tr key={task} className="border-b border-line last:border-0">
                    <td className="py-2 font-medium">{task}</td>
                    <td>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        d.startsWith("Never") || d.startsWith("Human") ? "bg-alert-light text-alert" : d.startsWith("AI drafts") ? "bg-warn-light text-warn" : "bg-ok-light text-ok"}`}>{d}</span>
                    </td>
                    <td className="text-gray-700">{why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <div className="mt-4">
        <Card title="Implementation roadmap">
          <div className="grid gap-3 md:grid-cols-4">
            {ROADMAP.map((p) => (
              <div key={p.phase} className="rounded-lg border border-line p-3">
                <div className="text-sm font-semibold text-navy-dark">{p.phase}</div>
                <div className="text-xs text-muted">{p.time}</div>
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-gray-700">{p.items.map((x) => <li key={x}>{x}</li>)}</ul>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Success indicators (go / no-go for each phase)">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-line text-left text-xs uppercase text-muted"><th className="py-1">Metric</th><th>Target</th><th>Where measured</th></tr></thead>
            <tbody>
              {KPIS.map(([m, t, w]) => (
                <tr key={m} className="border-b border-line last:border-0"><td className="py-1.5">{m}</td><td className="font-medium">{t}</td><td className="text-xs text-muted">{w}</td></tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Recommendation">
          <p className="text-sm text-gray-800">
            <span className="font-semibold text-navy-dark">Proceed to a controlled pilot, not full deployment.</span> Deploy TriageIQ as
            decision support for one complaint team (credit card), starting in shadow mode, with people approving every reply and
            Compliance owning every high-risk case. Expand only when the pilot meets the success indicators, above all zero missed
            high-risk cases and measured time savings.
          </p>
          <p className="mt-2 text-sm text-gray-800">
            Do not automate sending replies, closing complaints or deciding refunds. Re-evaluate after any model change and
            quarterly for drift and fairness.
          </p>
          <p className="mt-3 text-xs text-muted">Student analysis for a course project; not advice to Capital One.</p>
        </Card>
      </div>
    </>
  );
}
