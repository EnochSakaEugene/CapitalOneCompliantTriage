"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useRole } from "@/components/role";
import { Button, Card, DeadlineChip, ErrorBox, FlagChips, Loading, RiskBadge, StatusPill } from "@/components/ui";
import { api, type CaseDetail, type TraceStep } from "@/lib/api";

const AGENT_LABELS: Record<string, string> = {
  classify: "Intake & Classification Agent",
  research: "Policy Research Agent (RAG)",
  route: "Routing Agent (tools)",
  draft: "Response Drafting Agent",
  escalate: "Escalation to Compliance",
};

function Trace({ steps }: { steps: TraceStep[] }) {
  return (
    <ol className="relative ml-2 border-l-2 border-navy-light">
      {steps.map((s, i) => (
        <li key={i} className="mb-4 ml-4">
          <span
            className={`absolute -left-[7px] mt-1 h-3 w-3 rounded-full ${s.agent === "escalate" ? "bg-alert" : "bg-navy"}`}
          />
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-semibold">{AGENT_LABELS[s.agent] ?? s.agent}</span>
            <span className="text-xs tabular-nums text-muted">{s.ms} ms</span>
          </div>
          <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-[11px] text-gray-700">
            {JSON.stringify(s.output, null, 1)}
          </pre>
        </li>
      ))}
    </ol>
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

  const apply = (d: CaseDetail) => {
    setData(d);
    setReply(d.triage?.final_reply ?? d.triage?.draft_reply ?? "");
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

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/queue" className="text-sm text-navy hover:underline">
            ← Back to queue
          </Link>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-semibold text-navy-dark">
            Complaint {data.id} <StatusPill status={data.status} />
            {t && <RiskBadge level={t.risk_level} />}
          </h1>
        </div>
        {t && (
          <div className="text-right text-sm">
            <div className="text-muted">Response deadline</div>
            <div>
              {t.deadline} · <DeadlineChip daysLeft={t.days_left} />
            </div>
          </div>
        )}
      </div>
      {error && <div className="mb-4"><ErrorBox error={error} /></div>}

      {!t ? (
        <Card>
          <p className="mb-3 text-sm">This complaint has not been triaged yet.</p>
          <Button onClick={() => act(() => api.triage(data.id))} disabled={busy}>
            {busy ? "Running agents…" : "Run triage agents"}
          </Button>
          <p className="mt-4 whitespace-pre-wrap text-sm text-gray-700">{data.narrative}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card title="Complaint">
              <p className="mb-3 rounded bg-navy-light p-3 text-sm text-navy-dark">
                <span className="font-semibold">AI summary: </span>
                {t.summary}
              </p>
              <p className="max-h-80 overflow-y-auto whitespace-pre-wrap text-sm text-gray-700">{data.narrative}</p>
              <p className="mt-3 text-xs text-muted">
                Received {data.date_received ?? "—"} · {data.submitted_via ?? "—"} · {data.state ?? "—"}
                {data.tags ? ` · ${data.tags}` : ""}
              </p>
            </Card>

            <Card title="Classification">
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-xs text-muted">Product</dt>
                  <dd className="font-medium">{t.pred_product}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Issue</dt>
                  <dd>{t.pred_issue}</dd>
                </div>
                <div className="flex gap-6">
                  <div>
                    <dt className="text-xs text-muted">Confidence</dt>
                    <dd className="tabular-nums">{Math.round(t.confidence * 100)}%</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Sentiment</dt>
                    <dd>{t.sentiment}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted">Similar cases</dt>
                    <dd className="tabular-nums">{t.prior_similar}</dd>
                  </div>
                </div>
                <div>
                  <dt className="text-xs text-muted">Risk flags</dt>
                  <dd className="mt-1">
                    {t.risk_flags.length ? <FlagChips flags={t.risk_flags} /> : "None"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted">Why this risk level</dt>
                  <dd className="text-gray-700">{t.risk_reason}</dd>
                </div>
                <div className="border-t border-line pt-2 text-xs text-muted">
                  CFPB label (ground truth): {data.cfpb_labels.product ?? "—"} / {data.cfpb_labels.issue ?? "—"}
                </div>
              </dl>
            </Card>

            <Card title="Policy references (RAG)">
              <ul className="space-y-3">
                {t.citations.map((c) => (
                  <li key={c.chunk_id} className="text-sm">
                    <div className="flex items-baseline justify-between gap-2">
                      {c.url ? (
                        <a href={c.url} target="_blank" rel="noreferrer" className="font-medium text-navy hover:underline">
                          {c.title}
                        </a>
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

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <div className="lg:col-span-2">
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
                  onChange={(e) => setReply(e.target.value)}
                  disabled={done}
                  rows={12}
                  className="w-full rounded-md border border-line p-3 text-sm outline-none focus:ring-2 focus:ring-navy/30 disabled:bg-gray-50"
                />
                {!done && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {data.status !== "escalated" ? (
                      <>
                        <Button onClick={() => act(() => api.approve(data.id, role, reply))} disabled={busy || !reply}>
                          Approve reply
                        </Button>
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Reason for escalation"
                          className="min-w-56 flex-1 rounded-md border border-line px-3 py-2 text-sm"
                        />
                        <Button variant="danger" onClick={() => act(() => api.escalate(data.id, role, reason))} disabled={busy}>
                          Escalate to Compliance
                        </Button>
                      </>
                    ) : (
                      <>
                        <input
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder="Resolution notes"
                          className="min-w-56 flex-1 rounded-md border border-line px-3 py-2 text-sm"
                        />
                        <Button onClick={() => act(() => api.close(data.id, role, reason, reply || undefined))} disabled={busy}>
                          Close case
                        </Button>
                      </>
                    )}
                    <Button variant="secondary" onClick={() => act(() => api.triage(data.id))} disabled={busy}>
                      Re-run agents
                    </Button>
                  </div>
                )}
                {done && (
                  <p className="mt-2 text-sm text-ok">
                    {data.status === "approved" ? "Approved" : "Closed"} by {t.reviewer ?? "reviewer"}.
                  </p>
                )}
              </Card>
            </div>
            <Card title="Agent trace">
              <Trace steps={t.trace} />
              <p className="text-xs text-muted">
                Models: {String(t.model_info.fast)} / {String(t.model_info.strong)}
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
                    <span className="w-16 shrink-0">{e.action}</span>
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
