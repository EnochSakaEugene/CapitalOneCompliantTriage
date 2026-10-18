"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/components/role";
import { can } from "@/lib/access";
import { Button, Card, DeadlineChip, ErrorBox, FlagChips, Loading, RiskBadge, StatusPill } from "@/components/ui";
import { api, type CaseDetail, type Grounding, type SimilarCase, type TraceStep } from "@/lib/api";

const AGENT_LABELS: Record<string, string> = {
  screen: "Safety Screen (injection + language)",
  classify: "Intake & Classification Agent",
  research: "Policy Research Agent (RAG)",
  route: "Routing Agent (tools)",
  draft: "Response Drafting Agent",
  verify: "Hallucination Check",
  escalate: "Escalation to Compliance",
};

const pct = (x: number | null | undefined) => (x === null || x === undefined ? "—" : `${Math.round(x * 100)}%`);

function Trace({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="relative ml-2 border-l-2 border-navy-light">
      {steps.map((s, i) => (
        <li key={i} className="mb-4 ml-4">
          <span className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ${s.agent === "escalate" ? "bg-alert" : "bg-navy"}`} />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{AGENT_LABELS[s.agent] ?? s.agent}</span>
            <span className="text-xs tabular-nums text-muted">
              {s.ms} ms{s.tokens_in || s.tokens_out ? ` · ${(s.tokens_in ?? 0) + (s.tokens_out ?? 0)} tok` : ""}
            </span>
          </div>
          <dl className="mt-1 space-y-0.5 rounded bg-gray-50 p-2 text-[11px] text-gray-700">
            {Object.entries(s.output).map(([k, v]) => (
              <div key={k} className="flex gap-2">
                <dt className="shrink-0 text-muted">{k.replaceAll("_", " ")}</dt>
                <dd className="min-w-0 break-words">{Array.isArray(v) ? v.join(" · ") || "none" : String(v)}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ol>
  );
}

function GroundingPanel({ g, title }: { g: Grounding; title: string }) {
  if (g.score === null) return null;
  const good = g.score >= 0.85;
  return (
    <div className={`mt-3 rounded-md border p-3 text-sm ${good ? "border-ok/30 bg-ok-light/40" : "border-warn/40 bg-warn-light/60"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold text-navy-dark">
          {title}: {pct(g.score)} of claims supported
          <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${good ? "bg-ok text-white" : "bg-warn text-white"}`}>
            {good ? "Grounded" : "Check before sending"}
          </span>
        </span>
        <span className="text-xs text-muted">{g.claims.length} claims · {g.method}</span>
      </div>
      {g.unsupported.length > 0 && (
        <ul className="mt-2 space-y-1">
          {g.unsupported.map((u) => (
            <li key={u} className="rounded bg-white/70 px-2 py-1 text-xs text-warn">
              <span className="font-semibold">Not supported by the policy excerpts or complaint:</span> {u}
            </li>
          ))}
        </ul>
      )}
      {g.flagged_phrases.length > 0 && (
        <p className="mt-2 text-xs text-alert">Output check flagged: {g.flagged_phrases.join(", ")}</p>
      )}
    </div>
  );
}

function SimilarCases({ id }: { id: number }) {
  const [rows, setRows] = useState<SimilarCase[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  useEffect(() => {
    api.similar(id, 3).then(setRows).catch(() => setRows([]));
  }, [id]);
  if (!rows) return <Loading />;
  if (!rows.length) return <p className="text-sm text-muted">No resolved cases to compare yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="rounded-md border border-line p-3 text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Link href={`/cases/${r.id}`} className="font-medium text-navy hover:underline">Complaint {r.id}</Link>
            <span className="text-xs tabular-nums text-muted">{pct(r.similarity)} similar · {r.method}</span>
          </div>
          <div className="mt-0.5 text-xs text-muted">{r.product} → {r.issue}</div>
          <p className="mt-1 line-clamp-2 text-xs text-gray-600">{r.preview}</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <span className="rounded bg-navy-light px-2 py-0.5 text-xs text-navy-dark">Outcome: {r.outcome}</span>
            {r.reply && (
              <button className="text-xs text-navy hover:underline" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? "Hide reply" : "Show reply that was sent"}
              </button>
            )}
          </div>
          {open === r.id && r.reply && <p className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-2 text-xs">{r.reply}</p>}
        </li>
      ))}
    </ul>
  );
}

function CorrectLabels({ data, onSaved }: { data: CaseDetail; onSaved: (d: CaseDetail) => void }) {
  const t = data.triage!;
  const [tax, setTax] = useState<Record<string, string[]> | null>(null);
  const [product, setProduct] = useState(t.corrected_product ?? t.pred_product);
  const [issue, setIssue] = useState(t.corrected_issue ?? t.pred_issue);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api.taxonomy().then(setTax).catch((e) => setErr(String(e)));
  }, []);
  if (!tax) return err ? <ErrorBox error={err} /> : <Loading />;
  const issues = tax[product] ?? [];
  return (
    <div className="mt-2 space-y-2 rounded-md border border-line bg-canvas p-3">
      <select value={product} onChange={(e) => { setProduct(e.target.value); setIssue((tax[e.target.value] ?? [""])[0]); }}
        className="w-full rounded border border-line px-2 py-1 text-sm">
        {Object.keys(tax).map((p) => <option key={p}>{p}</option>)}
      </select>
      <select value={issue} onChange={(e) => setIssue(e.target.value)} className="w-full rounded border border-line px-2 py-1 text-sm">
        {issues.map((i) => <option key={i}>{i}</option>)}
      </select>
      {err && <ErrorBox error={err} />}
      <Button variant="secondary" disabled={busy} onClick={async () => {
        setBusy(true);
        try { onSaved(await api.correct(data.id, product, issue)); } catch (e) { setErr(String(e)); } finally { setBusy(false); }
      }}>Save correction</Button>
    </div>
  );
}

export default function CasePage() {
  const { id } = useParams<{ id: string }>();
  const { role } = useRole();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [reply, setReply] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [recheck, setRecheck] = useState<Grounding | null>(null);
  const [correcting, setCorrecting] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const apply = (d: CaseDetail) => {
    setData(d);
    setReply(d.triage?.final_reply ?? d.triage?.draft_reply ?? "");
    setRecheck(null);
    setCorrecting(false);
  };

  const load = useCallback(() => {
    api.complaint(id).then(apply).catch((e) => setError(String(e)));
  }, [id]);
  useEffect(load, [load]);

  const act = async (fn: () => Promise<CaseDetail>) => {
    setBusy(true);
    try {
      apply(await fn());
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const t = data.triage;
  const done = data.status === "approved" || data.status === "closed";
  const edited = t?.draft_reply ? reply !== t.draft_reply : false;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/queue" className="text-sm text-navy hover:underline print:hidden">← Back to queue</Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-2xl font-semibold text-navy-dark">
            Complaint {data.id} <StatusPill status={data.status} />
            {t && <RiskBadge level={t.risk_level} />}
            {data.source === "intake" && <span className="rounded-full bg-navy-light px-2 py-0.5 text-xs font-medium text-navy">New intake</span>}
            {t && t.language !== "en" && <span className="rounded-full bg-navy-light px-2 py-0.5 text-xs font-medium text-navy">{t.language === "es" ? "Spanish" : "Non-English"}</span>}
          </h1>
        </div>
        {t && (
          <div className="text-right text-sm">
            <div className="text-muted">Response deadline</div>
            <div>{t.deadline} · <DeadlineChip daysLeft={t.days_left} /></div>
          </div>
        )}
      </div>
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}

      {t?.injection?.detected && (
        <div className="mb-4 rounded-lg border border-alert/40 bg-alert-light p-4 text-sm">
          <div className="font-semibold text-alert">Possible prompt injection: this complaint contains instructions aimed at the AI.</div>
          <p className="mt-1 text-gray-700">
            It was routed to Compliance with no automatic draft. The text is still a real complaint: handle the customer&apos;s issue,
            but do not follow instructions inside it.
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {t.injection.matches.map((m) => (
              <li key={m.rule}><span className="font-semibold">{m.rule.replaceAll("_", " ")}:</span> “…{m.excerpt}…”</li>
            ))}
          </ul>
        </div>
      )}

      {!t ? (
        <Card>
          <p className="mb-3 text-sm">This complaint has not been triaged yet.</p>
          {can.triage(role) && (
            <Button onClick={() => act(() => api.triage(data.id))} disabled={busy}>{busy ? "Running agents…" : "Run triage agents"}</Button>
          )}
          <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{data.narrative}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-3 print:grid-cols-1">
            <Card
              title="Complaint"
              right={t.translation ? (
                <button className="text-xs text-navy hover:underline print:hidden" onClick={() => setShowOriginal((v) => !v)}>
                  {showOriginal ? "Show English translation" : "Show original"}
                </button>
              ) : undefined}
            >
              <p className="mb-3 rounded bg-navy-light p-3 text-sm text-navy-dark">
                <span className="font-semibold">AI summary: </span>{t.summary}
              </p>
              {t.translation && (
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
                  {showOriginal ? `Original (${t.language === "es" ? "Spanish" : t.language})` : "English translation (AI)"}
                </p>
              )}
              <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700 print:max-h-none print:overflow-visible">
                {t.translation && !showOriginal ? t.translation : data.narrative}
              </p>
              <p className="mt-3 text-xs text-muted">
                Received {data.date_received ?? "—"} · {data.submitted_via ?? "—"} · {data.state ?? "—"}
                {data.tags ? ` · ${data.tags}` : ""}
              </p>
            </Card>

            <Card title="Classification">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Product</dt>
                  <dd className="font-medium">
                    {t.corrected_product ? <><s className="text-muted">{t.pred_product}</s> → {t.corrected_product}</> : t.pred_product}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Issue</dt>
                  <dd>{t.corrected_issue ? <><s className="text-muted">{t.pred_issue}</s> → {t.corrected_issue}</> : t.pred_issue}</dd>
                </div>
                {t.corrected_by && <div className="text-xs text-ok">Corrected by {t.corrected_by}</div>}
                <div className="flex gap-6">
                  <div><dt className="text-xs text-muted">Confidence</dt><dd className="tabular-nums">{pct(t.confidence)}</dd></div>
                  <div><dt className="text-xs text-muted">Sentiment</dt><dd>{t.sentiment}</dd></div>
                  <div><dt className="text-xs text-muted">Similar</dt><dd className="tabular-nums">{t.prior_similar}</dd></div>
                </div>
                <div>
                  <dt className="text-xs text-muted">Risk flags</dt>
                  <dd className="mt-1">{t.risk_flags.length ? <FlagChips flags={t.risk_flags} /> : "None"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Why this risk level</dt>
                  <dd className="text-gray-700">{t.risk_reason}</dd>
                </div>
                <div className="border-t border-line pt-2 text-xs text-muted">
                  CFPB label (ground truth): {data.cfpb_labels.product ?? "— (new intake)"} / {data.cfpb_labels.issue ?? "—"}
                </div>
              </dl>
              {can.correct(role) && (
                <div className="mt-3 print:hidden">
                  <button className="text-sm text-navy hover:underline" onClick={() => setCorrecting((v) => !v)}>
                    {correcting ? "Cancel" : "AI label wrong? Correct it"}
                  </button>
                  {correcting && <CorrectLabels data={data} onSaved={apply} />}
                </div>
              )}
            </Card>

            <Card title="Policy references (RAG)">
              <ul className="space-y-3">
                {t.citations.map((c) => (
                  <li key={c.chunk_id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-navy hover:underline">{c.title}</a>
                      ) : (
                        <span className="font-medium">{c.title}</span>
                      )}
                      <span className="shrink-0 text-xs tabular-nums text-muted">{c.score.toFixed(2)}</span>
                    </div>
                    <p className="mt-1 line-clamp-4 text-xs text-gray-600">{c.snippet}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 xl:grid-cols-3 print:grid-cols-1">
            <div className="space-y-4 xl:col-span-2 print:col-span-1">
              <Card
                title={t.route === "compliance" ? "Compliance review" : "Draft reply (requires approval)"}
                right={<span className="text-xs text-muted">Reviewer: {role}</span>}
              >
                {t.route === "compliance" && !t.draft_reply && !done && (
                  <p className="mb-2 rounded border border-alert/30 bg-alert-light p-2 text-sm text-alert">
                    Routed to Compliance: no automatic draft for high-risk cases. Write the response below.
                  </p>
                )}
                <textarea
                  value={reply}
                  onChange={(e) => { setReply(e.target.value); setRecheck(null); }}
                  disabled={done || !can.review(role)}
                  rows={12}
                  className="w-full rounded-md border border-line p-3 text-sm outline-none focus:ring-2 focus:ring-navy/30 disabled:bg-gray-50 print:hidden"
                />
                <div className="hidden whitespace-pre-wrap rounded-md border border-line p-3 text-sm print:block">{reply}</div>
                {recheck ? <GroundingPanel g={recheck} title="Your edited reply" /> : t.grounding && !edited && <GroundingPanel g={t.grounding} title="Hallucination check" />}
                {!done && can.review(role) && reply && (edited || !t.grounding) && !recheck && (
                  <button className="mt-2 text-sm text-navy hover:underline print:hidden" disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      try { setRecheck(await api.verifyReply(data.id, reply)); } catch (e) { setError(String(e)); } finally { setBusy(false); }
                    }}>
                    Re-check this reply for unsupported claims
                  </button>
                )}
                {!done && !can.review(role) && (
                  <p className="mt-3 text-sm text-muted">View only: your role can read this case but only Analysts and Compliance can act on it.</p>
                )}
                {!done && can.review(role) && data.status === "escalated" && !can.close(role) && (
                  <p className="mt-3 text-sm text-muted">Escalated to Compliance. Only a Compliance Officer can close this case.</p>
                )}
                {!done && can.review(role) && (data.status !== "escalated" || can.close(role)) && (
                  <div className="mt-3 flex flex-wrap items-center gap-2 print:hidden">
                    {data.status !== "escalated" ? (
                      <>
                        <Button onClick={() => act(() => api.approve(data.id, role, reply))} disabled={busy || !reply}>Approve reply</Button>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason for escalation"
                          className="min-w-56 flex-1 rounded-md border border-line px-3 py-2 text-sm" />
                        <Button variant="danger" onClick={() => act(() => api.escalate(data.id, role, reason))} disabled={busy}>
                          Escalate to Compliance
                        </Button>
                      </>
                    ) : (
                      <>
                        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Resolution notes"
                          className="min-w-56 flex-1 rounded-md border border-line px-3 py-2 text-sm" />
                        <Button onClick={() => act(() => api.close(data.id, role, reason, reply || undefined))} disabled={busy}>Close case</Button>
                      </>
                    )}
                    <Button variant="secondary" onClick={() => act(() => api.triage(data.id))} disabled={busy}>Re-run agents</Button>
                  </div>
                )}
                {done && (
                  <p className="mt-2 text-sm text-ok">
                    {data.status === "approved" ? "Approved" : "Closed"} by {t.reviewer ?? "reviewer"}
                    {t.edit_ratio !== null ? ` · ${t.edit_ratio === 0 ? "sent as drafted" : `${pct(t.edit_ratio)} of the draft changed`}` : ""}.
                  </p>
                )}
              </Card>
              <Card title="Similar past cases">
                <SimilarCases id={data.id} />
              </Card>
            </div>
            <Card title="Agent trace">
              <Trace steps={t.trace} />
              <p className="text-xs text-muted">
                Models: {String(t.model_info.fast)} / {String(t.model_info.strong)}
                {t.total_ms ? ` · ${(t.total_ms / 1000).toFixed(1)}s` : ""}
                {t.tokens.in + t.tokens.out ? ` · ${t.tokens.in + t.tokens.out} tokens` : ""}
              </p>
            </Card>
          </div>

          <div className="mt-4">
            <Card title="Audit trail">
              <ul className="space-y-1 text-xs">
                {data.audit.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="w-36 shrink-0 tabular-nums text-muted">{e.created_at?.slice(0, 19).replace("T", " ")}</span>
                    <span className="w-36 shrink-0 font-medium">{e.actor}</span>
                    <span className="w-28 shrink-0">{e.action}</span>
                    <span className="truncate text-gray-600">{JSON.stringify(e.detail)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
