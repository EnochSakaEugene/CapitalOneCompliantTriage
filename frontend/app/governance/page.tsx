"use client";
// Governance: human oversight metrics, model card, fairness checks and the AI risk register.
import { useState } from "react";
import { useRole } from "@/components/role";
import { Button, Card, ErrorBox, Loading, PageHeader, RefreshControl } from "@/components/ui";
import { api, type FairnessRow, type Level, type RiskItem } from "@/lib/api";
import { useLive } from "@/lib/useLive";

const pct = (v: number | null | undefined) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

const INDICATOR_LABELS: Record<string, string> = {
  override_rate: "Override rate",
  approve_without_edit_rate: "Approved without edits",
  pii_redactions: "PII redactions",
  product_accuracy: "Product accuracy",
};

function Stat({ label, value, note, tone = "text-navy-dark" }: { label: string; value: string | number; note?: string; tone?: string }) {
  return (
    <Card>
      <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-3xl font-semibold tabular-nums ${tone}`}>{value}</div>
      {note && <div className="mt-1 text-xs text-muted">{note}</div>}
    </Card>
  );
}

function LevelPill({ level }: { level: Level }) {
  const cls = { high: "bg-alert-light text-alert", medium: "bg-warn-light text-warn", low: "bg-ok-light text-ok" }[level];
  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${cls}`}>{level}</span>;
}

function FairnessTable({ title, rows, minGroup }: { title: string; rows: FairnessRow[]; minGroup: number }) {
  return (
    <Card title={title}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">No triaged complaints yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr>
                <th className="py-1 pr-2">Group</th>
                <th className="py-1 pr-2 text-right">Cases</th>
                <th className="py-1 pr-2 text-right">High risk</th>
                <th className="py-1 pr-2 text-right">Escalated</th>
                <th className="py-1 pr-2 text-right">Product acc.</th>
                <th className="py-1 text-right">Avg conf.</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.group} className={`border-t border-line ${r.small_sample ? "text-muted" : ""}`}>
                  <td className="py-1.5 pr-2">
                    {r.group}
                    {r.small_sample && <span className="ml-1 text-[10px]">(n &lt; {minGroup})</span>}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{r.n}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{pct(r.high_risk_rate)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{pct(r.escalation_rate)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{pct(r.product_accuracy)}</td>
                  <td className="py-1.5 text-right tabular-nums">{pct(r.avg_confidence)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function RiskRow({ item, indicators, onSaved }: { item: RiskItem; indicators: Record<string, number | null>; onSaved: () => void }) {
  const { role } = useRole();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState(item);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ind = item.indicator ? indicators[item.indicator] : undefined;
  const indValue = item.indicator === "pii_redactions" ? String(ind ?? 0) : pct(ind as number | null);

  const save = async () => {
    setBusy(true);
    try {
      const { updated_at: _u, indicator: _i, ...rest } = draft;
      await api.saveRisk({ ...rest, reviewer: role });
      setEdit(false);
      setError(null);
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (edit) {
    return (
      <tr className="border-t border-line align-top bg-gray-50">
        <td className="py-2 pr-2" colSpan={7}>
          <div className="grid gap-2 md:grid-cols-6">
            <textarea value={draft.risk} onChange={(e) => setDraft({ ...draft, risk: e.target.value })} rows={2} className="rounded border border-line p-2 text-sm md:col-span-3" />
            <select value={draft.likelihood} onChange={(e) => setDraft({ ...draft, likelihood: e.target.value as Level })} className="rounded border border-line px-2 py-1 text-sm">
              {["low", "medium", "high"].map((v) => <option key={v} value={v}>Likelihood: {v}</option>)}
            </select>
            <select value={draft.impact} onChange={(e) => setDraft({ ...draft, impact: e.target.value as Level })} className="rounded border border-line px-2 py-1 text-sm">
              {["low", "medium", "high"].map((v) => <option key={v} value={v}>Impact: {v}</option>)}
            </select>
            <select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as RiskItem["status"] })} className="rounded border border-line px-2 py-1 text-sm">
              {["open", "monitoring", "mitigated"].map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
            <textarea value={draft.mitigation} onChange={(e) => setDraft({ ...draft, mitigation: e.target.value })} rows={3} className="rounded border border-line p-2 text-sm md:col-span-4" placeholder="Mitigation / controls" />
            <input value={draft.owner} onChange={(e) => setDraft({ ...draft, owner: e.target.value })} className="rounded border border-line px-2 py-1 text-sm" placeholder="Owner" />
            <input value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className="rounded border border-line px-2 py-1 text-sm" placeholder="Category" />
          </div>
          {error && <div className="mt-2"><ErrorBox error={error} /></div>}
          <div className="mt-2 flex gap-2">
            <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button>
            <Button variant="secondary" onClick={() => { setDraft(item); setEdit(false); }} disabled={busy}>Cancel</Button>
          </div>
        </td>
      </tr>
    );
  }
  return (
    <tr className="border-t border-line align-top">
      <td className="py-2 pr-2">
        <div className="font-medium">{item.risk}</div>
        <div className="mt-1 text-xs text-gray-600">{item.mitigation}</div>
      </td>
      <td className="py-2 pr-2 text-xs capitalize">{item.category}</td>
      <td className="py-2 pr-2"><LevelPill level={item.likelihood} /></td>
      <td className="py-2 pr-2"><LevelPill level={item.impact} /></td>
      <td className="py-2 pr-2 text-xs">
        {item.indicator ? (
          <>
            <div className="text-muted">{INDICATOR_LABELS[item.indicator] ?? item.indicator}</div>
            <div className="font-semibold tabular-nums">{indValue}</div>
          </>
        ) : (
          <span className="text-muted">—</span>
        )}
      </td>
      <td className="py-2 pr-2 text-xs">
        <div className="capitalize">{item.status}</div>
        <div className="text-muted">{item.owner}</div>
      </td>
      <td className="py-2 text-right print:hidden">
        <Button variant="secondary" onClick={() => setEdit(true)}>Edit</Button>
      </td>
    </tr>
  );
}

function AddRisk({ onSaved }: { onSaved: () => void }) {
  const { role } = useRole();
  const [open, setOpen] = useState(false);
  const [risk, setRisk] = useState("");
  const [category, setCategory] = useState("operational");
  const [mitigation, setMitigation] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return <Button onClick={() => setOpen(true)}>Add risk</Button>;
  const save = async () => {
    setBusy(true);
    try {
      await api.createRisk({ risk, category, mitigation, reviewer: role });
      setOpen(false);
      setRisk("");
      setMitigation("");
      onSaved();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 grid gap-2 rounded border border-line bg-gray-50 p-3 md:grid-cols-6">
      <input value={risk} onChange={(e) => setRisk(e.target.value)} placeholder="Describe the risk" className="rounded border border-line px-2 py-1 text-sm md:col-span-4" />
      <select value={category} onChange={(e) => setCategory(e.target.value)} className="rounded border border-line px-2 py-1 text-sm md:col-span-2">
        {["accuracy", "fairness", "privacy", "security", "oversight", "operational"].map((c) => <option key={c}>{c}</option>)}
      </select>
      <input value={mitigation} onChange={(e) => setMitigation(e.target.value)} placeholder="Mitigation (optional)" className="rounded border border-line px-2 py-1 text-sm md:col-span-6" />
      <div className="flex gap-2 md:col-span-6">
        <Button onClick={save} disabled={busy || risk.length < 5}>{busy ? "Saving…" : "Save risk"}</Button>
        <Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export default function GovernancePage() {
  const gov = useLive(() => api.governance());
  const risks = useLive(() => api.risks(), [], 60000);
  const g = gov.data;
  if (gov.error && !g) return <ErrorBox error={gov.error} />;
  if (!g) return <Loading />;
  const o = g.oversight;
  const mc = g.model_card;
  const refreshAll = () => { gov.refresh(); risks.refresh(); };

  return (
    <>
      <PageHeader
        title="Governance"
        subtitle="Human oversight, model card, fairness checks and the AI risk register. Every decision here is in the Audit Log."
        actions={<RefreshControl updatedAt={gov.updatedAt} loading={gov.loading} onRefresh={refreshAll} />}
      />

      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Human oversight</h2>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Cases reviewed by people" value={o.reviewed} note={`of ${o.triaged} triaged · ${o.approved} approved · ${o.closed} closed`} />
        <Stat label="Approved without edits" value={pct(o.approve_without_edit_rate)} note={`${o.approved_with_edits} of ${o.approved} approvals were edited`} tone={o.approve_without_edit_rate != null && o.approve_without_edit_rate > 0.9 ? "text-warn" : "text-navy-dark"} />
        <Stat label="AI routing overridden" value={pct(o.override_rate)} note={`${o.overrides} auto-draft case${o.overrides === 1 ? "" : "s"} escalated by a person`} tone={o.overrides ? "text-alert" : "text-navy-dark"} />
        <Stat label="Escalated by AI" value={o.ai_escalated} note={`${o.human_escalations} more escalated by people · ${o.pii_redactions} PII redactions`} />
      </div>

      <div className="mb-6 grid gap-4 xl:grid-cols-2">
        <Card title="Model card">
          <dl className="grid grid-cols-[10rem_1fr] gap-x-3 gap-y-1.5 text-sm">
            <dt className="text-muted">Provider</dt><dd>{mc.provider === "mock" ? "Mock mode (keyword rules, no LLM)" : mc.provider === "gemini" ? "Google Gemini" : "OpenAI"}</dd>
            <dt className="text-muted">Classification</dt><dd>{mc.classification_model}</dd>
            <dt className="text-muted">Drafting</dt><dd>{mc.drafting_model}{mc.reasoning_effort ? ` · reasoning ${mc.reasoning_effort}` : ""}</dd>
            <dt className="text-muted">Embeddings</dt><dd>{mc.embedding_model}</dd>
            <dt className="text-muted">Knowledge base</dt><dd>{mc.policy_sections} policy sections</dd>
            <dt className="text-muted">Data</dt><dd>{mc.complaints_loaded.toLocaleString()} CFPB complaints, received {mc.data_window[0] ?? "—"} to {mc.data_window[1] ?? "—"}</dd>
            <dt className="text-muted">Latest evaluation</dt>
            <dd>{mc.evaluation.n} cases · product {pct(mc.evaluation.product_accuracy)} · issue {pct(mc.evaluation.issue_accuracy)}</dd>
            <dt className="text-muted">Intended use</dt><dd>{mc.intended_use}</dd>
            <dt className="text-muted">Out of scope</dt><dd>{mc.out_of_scope}</dd>
          </dl>
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Known limitations</div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-gray-700">
              {mc.limitations.map((l) => <li key={l}>{l}</li>)}
            </ul>
          </div>
        </Card>
        <div className="space-y-4">
          <FairnessTable title="Fairness check by tag" rows={g.fairness.by_tag} minGroup={g.fairness.min_group} />
          <FairnessTable title="Fairness check by state (top 10)" rows={g.fairness.by_state} minGroup={g.fairness.min_group} />
          <p className="text-xs text-muted">
            Compare rates across groups with at least {g.fairness.min_group} cases. A gap is a prompt to investigate, not proof of bias:
            groups can differ in the products and issues they complain about.
          </p>
        </div>
      </div>

      <Card title="AI risk register" right={<span className="text-xs text-muted">Sorted by likelihood × impact</span>}>
        {risks.error && !risks.data ? (
          <ErrorBox error={risks.error} />
        ) : !risks.data ? (
          <Loading />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 pr-2">Risk and mitigation</th>
                  <th className="py-1 pr-2">Category</th>
                  <th className="py-1 pr-2">Likelihood</th>
                  <th className="py-1 pr-2">Impact</th>
                  <th className="py-1 pr-2">Live indicator</th>
                  <th className="py-1 pr-2">Status / owner</th>
                  <th className="py-1 print:hidden" />
                </tr>
              </thead>
              <tbody>
                {risks.data.map((r) => (
                  <RiskRow key={`${r.id}-${r.updated_at}`} item={r} indicators={g.indicators} onSaved={risks.refresh} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3 print:hidden">
          <AddRisk onSaved={risks.refresh} />
        </div>
      </Card>
    </>
  );
}
