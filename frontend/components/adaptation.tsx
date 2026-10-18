"use client";
// Model adaptation comparison (prompting vs trained classifiers vs RAG vs fine-tuning) and the
// RAG ablation (hallucination with vs without retrieved policy excerpts).
import { useEffect, useState } from "react";
import { api, type Approach, type DraftingRun, type EvalRunSummary } from "@/lib/api";
import { Card, ErrorBox, Loading } from "./ui";

const pct = (v?: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export function Adaptation() {
  const [approaches, setApproaches] = useState<Approach[] | null>(null);
  const [runs, setRuns] = useState<EvalRunSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.all([api.approaches(), api.evalRuns()])
      .then(([a, r]) => { setApproaches(a); setRuns(r); })
      .catch((e) => setError(String(e)));
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!approaches) return <Loading />;
  // latest finished run per variant, any batch
  const latest = new Map<string, EvalRunSummary>();
  for (const r of runs) if (r.status === "done" && !latest.has(r.variant)) latest.set(r.variant, r);
  return (
    <Card title="Model adaptation: prompting vs trained models vs fine-tuning">
      <p className="mb-3 text-sm text-muted">
        Measured columns use the latest finished run of each approach (run them on the same batch for a fair comparison:
        <code className="mx-1 rounded bg-gray-100 px-1">run_eval --variants rules,tfidf,embed,v2,v4</code>).
        Full LLM fine-tuning was not built: it needs GPUs and labelled data, sends training data to a provider, and must be
        redone whenever products, issues or regulations change, while prompting and RAG change with a text edit.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="py-1 pr-3">Approach</th>
              <th className="py-1 pr-3 text-right">Product acc.</th>
              <th className="py-1 pr-3 text-right">Issue acc.</th>
              <th className="py-1 pr-3 text-right">Latency</th>
              <th className="py-1 pr-3">Cost</th>
              <th className="py-1 pr-3">Privacy</th>
              <th className="py-1 pr-3">Maintenance</th>
              <th className="py-1">Outputs</th>
            </tr>
          </thead>
          <tbody>
            {approaches.map((a) => {
              const r = latest.get(a.key);
              const m = r?.metrics;
              return (
                <tr key={a.key} className="border-t border-line align-top">
                  <td className="py-2 pr-3">
                    <div className="font-medium text-navy-dark">{a.approach}</div>
                    <div className="text-xs text-muted">{a.family}{r ? ` · n=${m?.n}` : ""}</div>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(m?.product_accuracy)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{pct(m?.issue_accuracy)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{m?.latency_ms_mean != null ? `${m.latency_ms_mean} ms` : "—"}</td>
                  <td className="py-2 pr-3 text-xs">{a.cost}</td>
                  <td className="py-2 pr-3 text-xs">{a.privacy}</td>
                  <td className="py-2 pr-3 text-xs">{a.maintenance}</td>
                  <td className="py-2 text-xs">{a.outputs}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function RagAblation() {
  const [runs, setRuns] = useState<DraftingRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api.draftingRuns().then(setRuns).catch((e) => setError(String(e)));
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!runs) return <Loading />;
  const name = runs[0]?.name;
  const rag = runs.find((r) => r.name === name && r.variant === "draft-rag");
  const norag = runs.find((r) => r.name === name && r.variant === "draft-norag");
  return (
    <Card title="RAG ablation: does retrieval reduce hallucination?">
      {!rag || !norag ? (
        <div className="text-sm text-muted">
          <p>No ablation run yet. It drafts replies for the same held-out complaints with and without the retrieved policy excerpts and
            runs the same hallucination check on both:</p>
          <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-3 text-xs">docker compose exec backend python -m scripts.run_rag_ablation --n 20 --seed 7 --rpm 8 --name &quot;rag ablation 1&quot;</pre>
        </div>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            Batch “{name}” · {rag.metrics.n} complaints · status {rag.status} · drafts by {rag.model}, checked by an independent judge call.
          </p>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted">
              <tr><th className="py-1">Metric</th><th className="py-1 text-right">With RAG</th><th className="py-1 text-right">Without RAG</th></tr>
            </thead>
            <tbody>
              {([
                ["Claims supported (mean)", pct(rag.metrics.grounded_mean), pct(norag.metrics.grounded_mean)],
                ["Drafts fully grounded", pct(rag.metrics.fully_grounded_rate), pct(norag.metrics.fully_grounded_rate)],
                ["Unsupported claims per draft", String(rag.metrics.unsupported_claims_mean ?? "—"), String(norag.metrics.unsupported_claims_mean ?? "—")],
                ["Claims per draft", String(rag.metrics.claims_mean ?? "—"), String(norag.metrics.claims_mean ?? "—")],
                ["Draft latency (mean)", `${rag.metrics.latency_ms_mean ?? "—"} ms`, `${norag.metrics.latency_ms_mean ?? "—"} ms`],
              ] as const).map(([k, a, b]) => (
                <tr key={k} className="border-t border-line">
                  <td className="py-1.5">{k}</td>
                  <td className="py-1.5 text-right font-semibold tabular-nums">{a}</td>
                  <td className="py-1.5 text-right tabular-nums">{b}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <button onClick={() => setOpen((v) => !v)} className="mt-3 text-sm text-navy hover:underline">
            {open ? "Hide examples" : "Show unsupported claims found without RAG"}
          </button>
          {open && (
            <ul className="mt-2 max-h-72 space-y-2 overflow-y-auto text-xs">
              {(norag.metrics.cases ?? []).filter((c) => c.unsupported.length).slice(0, 10).map((c) => (
                <li key={c.id} className="rounded border border-line p-2">
                  <div className="font-medium">Complaint {c.id} · {pct(c.score)} supported</div>
                  <ul className="mt-1 list-disc pl-4 text-warn">{c.unsupported.map((u) => <li key={u}>{u}</li>)}</ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}
