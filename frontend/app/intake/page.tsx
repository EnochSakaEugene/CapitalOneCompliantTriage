"use client";
// New Complaint: submit a complaint and watch each agent finish, live (Server-Sent Events).
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button, Card, ErrorBox, PageHeader, RiskBadge } from "@/components/ui";
import { api, streamTriage, type Risk, type StreamEvent, type TraceStep } from "@/lib/api";
import { can } from "@/lib/access";
import { useAuth } from "@/lib/auth";

const STEPS: { key: string; label: string; what: string }[] = [
  { key: "screen", label: "Safety screen", what: "Prompt-injection check and language detection (translation if needed)" },
  { key: "classify", label: "Classify", what: "CFPB product and issue, sentiment, urgency and risk flags" },
  { key: "research", label: "Research (RAG)", what: "Retrieves the most relevant regulation excerpts" },
  { key: "route", label: "Route", what: "Tools: similar-complaint count and 15-day deadline; draft or escalate" },
  { key: "draft", label: "Draft reply / Escalate", what: "Grounded reply for routine cases; high risk goes to Compliance" },
  { key: "verify", label: "Hallucination check", what: "Checks each claim in the draft against the excerpts" },
];

function detail(step: TraceStep): string {
  const o = step.output as Record<string, unknown>;
  switch (step.agent) {
    case "screen":
      return `${o.injection ? "⚠ Possible prompt injection (" + (o.rules as string[]).join(", ") + ")" : "No injection found"} · language: ${o.language}${o.translated ? " (translated)" : ""}`;
    case "classify":
      return `${o.product} → ${o.issue} · risk ${o.risk_level}${(o.flags as string[])?.length ? " · " + (o.flags as string[]).join(", ").replaceAll("_", " ") : ""}`;
    case "research":
      return (o.retrieved as string[]).join(" · ");
    case "route":
      return `${o.route === "compliance" ? "Escalate to Compliance" : "Auto-draft for analyst review"} · ${o.prior_similar} similar · due ${o.deadline}`;
    case "draft":
      return `${o.chars} characters · ${o.language === "es" ? "in Spanish" : "in English"}`;
    case "escalate":
      return `Assigned to Compliance queue: ${o.reason}`;
    case "verify":
      return o.score === null ? "No draft to check" : `${Math.round((o.score as number) * 100)}% of claims supported · ${o.unsupported} unsupported · ${o.method}`;
    default:
      return "";
  }
}

export default function IntakePage() {
  const { user } = useAuth();
  const allowed = can.intake(user?.role);
  const [samples, setSamples] = useState<{ label: string; channel: string; state: string; text: string }[]>([]);
  const [text, setText] = useState("");
  const [channel, setChannel] = useState("Web");
  const [state, setState] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caseId, setCaseId] = useState<number | null>(null);
  const [steps, setSteps] = useState<TraceStep[]>([]);
  const [done, setDone] = useState<{ status: string; route: string; risk_level: Risk } | null>(null);

  useEffect(() => {
    api.intakeSamples().then(setSamples).catch(() => {});
  }, []);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setSteps([]);
    setDone(null);
    setCaseId(null);
    try {
      const { id } = await api.intake(text, channel, state);
      setCaseId(id);
      await streamTriage(id, (e: StreamEvent) => {
        if (e.type === "step") setSteps((s) => [...s, e]);
        if (e.type === "done") setDone({ status: e.status, route: e.route, risk_level: e.risk_level });
        if (e.type === "error") setError(e.error);
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const doneKeys = new Set(steps.map((s) => (s.agent === "escalate" ? "draft" : s.agent)));
  const escalated = steps.some((s) => s.agent === "escalate");
  const nextKey = STEPS.find((s) => !doneKeys.has(s.key) && !(escalated && s.key === "verify"))?.key;
  const totalMs = steps.reduce((a, s) => a + s.ms, 0);

  return (
    <>
      <PageHeader
        title="New Complaint"
        subtitle="Submit a complaint as it would arrive from the web, phone or email, and watch each agent finish in real time."
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card title="Complaint">
          {!allowed && (
            <p className="mb-3 rounded-md border border-line bg-canvas px-3 py-2 text-sm text-muted">
              View only: your role can watch the pipeline on existing cases but only Analysts and Compliance can submit complaints.
            </p>
          )}
          <div className="mb-3">
            <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted">Try a sample (synthetic)</div>
            <div className="flex flex-wrap gap-2">
              {samples.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setText(s.text);
                    setChannel(s.channel);
                    setState(s.state);
                  }}
                  disabled={!allowed || busy}
                  className="rounded-full border border-line bg-white px-3 py-1 text-xs hover:border-navy hover:text-navy disabled:opacity-50"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={!allowed || busy}
            rows={9}
            placeholder="Describe what happened, in the customer's own words (English or Spanish)…"
            className="w-full rounded-md border border-line p-3 text-sm outline-none focus:ring-2 focus:ring-navy/30 disabled:bg-gray-50"
          />
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">Channel</span>
              <select value={channel} onChange={(e) => setChannel(e.target.value)} disabled={!allowed || busy}
                className="rounded-md border border-line px-2 py-1.5">
                {["Web", "Phone", "Email", "Branch", "Social media", "Referral"].map((c) => <option key={c}>{c}</option>)}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">State</span>
              <input value={state} onChange={(e) => setState(e.target.value.toUpperCase().slice(0, 2))} disabled={!allowed || busy}
                placeholder="VA" className="w-16 rounded-md border border-line px-2 py-1.5" />
            </label>
            <div className="ml-auto">
              <Button onClick={submit} disabled={!allowed || busy || text.trim().length < 30}>
                {busy ? "Agents working…" : "Submit and triage"}
              </Button>
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">
            Personal data (emails, phone, card and account numbers) is redacted before any AI call. Nothing is sent to the
            customer: every outcome waits for a person.
          </p>
        </Card>

        <Card title="Agent pipeline" right={totalMs ? <span className="text-xs text-muted tabular-nums">{(totalMs / 1000).toFixed(1)}s total</span> : undefined}>
          <ol className="space-y-2">
            {STEPS.map((s, i) => {
              const step = steps.find((x) => (x.agent === "escalate" ? "draft" : x.agent) === s.key);
              const skipped = escalated && s.key === "verify";
              const running = busy && !step && s.key === nextKey;
              return (
                <li key={s.key} className={`flex gap-3 rounded-md border p-3 ${step ? "border-ok/30 bg-ok-light/40" : running ? "border-navy/40 bg-navy-light/50" : "border-line"}`}>
                  <span
                    className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      step ? "bg-ok text-white" : running ? "bg-navy text-white" : "bg-gray-100 text-muted"
                    }`}
                    aria-hidden="true"
                  >
                    {step ? "✓" : running ? <span className="h-2 w-2 animate-pulse rounded-full bg-white" /> : i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-navy-dark">
                        {step?.agent === "escalate" ? "Escalate to Compliance" : step?.agent === "draft" ? "Draft reply" : s.label}
                      </span>
                      {step && <span className="text-xs tabular-nums text-muted">{step.ms} ms</span>}
                    </div>
                    <div className="text-xs text-muted">{step ? detail(step) : skipped ? "Skipped: no automatic draft for high-risk cases" : s.what}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          {error && <div className="mt-3"><ErrorBox error={error} /></div>}
          {done && caseId && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-navy/30 bg-navy-light/40 p-4">
              <div className="text-sm">
                <div className="flex items-center gap-2 font-semibold text-navy-dark">
                  Case {caseId} <RiskBadge level={done.risk_level} />
                </div>
                <div className="text-muted">
                  {done.route === "compliance" ? "Sent to the Compliance queue for a person to handle." : "Draft ready for analyst review."}
                </div>
              </div>
              <Link href={`/cases/${caseId}`} className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-dark">
                Open case →
              </Link>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
