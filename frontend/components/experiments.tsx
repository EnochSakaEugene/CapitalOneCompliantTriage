"use client";
// Evaluation experiments: compare classifier variants scored on the same held-out complaints.
import Link from "next/link";
import { useState } from "react";
import { API_URL, api, type EvalRunDetail, type EvalRunSummary } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { Button, Card, ErrorBox, Loading } from "./ui";

const pct = (v?: number | null) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);
const num = (v?: number | null) => (v == null ? "—" : v.toLocaleString());
const ORDER = ["rules", "tfidf", "embed", "v1", "v2", "v3", "v4"];

function latestPerVariant(runs: EvalRunSummary[]): EvalRunSummary[] {
  const seen = new Map<string, EvalRunSummary>();
  for (const r of runs) if (r.status !== "failed" && !seen.has(r.variant)) seen.set(r.variant, r);
  return [...seen.values()].sort((a, b) => ORDER.indexOf(a.variant) - ORDER.indexOf(b.variant));
}

function best(rows: EvalRunSummary[], key: keyof EvalRunSummary["metrics"], low = false) {
  const vals = rows.map((r) => r.metrics[key] as number | null | undefined).filter((v): v is number => v != null);
  if (!vals.length) return null;
  return low ? Math.min(...vals) : Math.max(...vals);
}

function Cell({ v, isBest, fmt }: { v?: number | null; isBest: boolean; fmt: (v?: number | null) => string }) {
  return <td className={`py-2 pr-3 text-right tabular-nums ${isBest ? "font-semibold text-ok" : ""}`}>{fmt(v)}</td>;
}

function Detail({ id }: { id: number }) {
  const { data, error } = useLive<EvalRunDetail>(() => api.evalRun(id), [id], 60000);
  if (error && !data) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  return (
    <div className="mt-4 grid gap-4 xl:grid-cols-2">
      <Card title={`Run #${data.id} · ${data.label} · by actual product`}>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr><th className="py-1">Product</th><th className="py-1 text-right">n</th><th className="py-1 text-right">Product acc.</th><th className="py-1 text-right">Issue acc.</th></tr>
          </thead>
          <tbody>
            {data.per_product.map((p) => (
              <tr key={p.product} className="border-t border-line">
                <td className="py-1.5 pr-2">{p.product}</td>
                <td className="py-1.5 text-right tabular-nums">{p.n}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(p.product_accuracy)}</td>
                <td className="py-1.5 text-right tabular-nums">{pct(p.issue_accuracy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">
          {String(data.config.prompt ?? "")} · {data.model} · seed {String(data.config.seed)}
          {data.config.few_shot_examples ? ` · ${String(data.config.few_shot_examples)} few-shot examples` : ""}
        </p>
        <button onClick={() => api.downloadEvalCsv(data.id)} className="mt-2 inline-block text-sm text-navy hover:underline">
          Download all cases (CSV)
        </button>
      </Card>
      <Card title={`Misclassified examples (${data.misses.length}${data.misses.length === 50 ? "+" : ""})`}>
        <ul className="max-h-96 space-y-2 overflow-y-auto text-xs">
          {data.misses.map((m) => (
            <li key={m.complaint_id} className="border-t border-line pt-2 first:border-0 first:pt-0">
              <Link href={`/cases/${m.complaint_id}`} className="font-medium text-navy hover:underline">{m.complaint_id}</Link>
              <div><span className="text-muted">CFPB:</span> {m.true_product} / {m.true_issue}</div>
              <div className="text-alert"><span className="text-muted">AI:</span> {m.pred_product} / {m.pred_issue}</div>
              {m.raw_issue && m.raw_issue !== m.pred_issue && (
                <div className="text-muted">AI wrote “{m.raw_issue}” (not a CFPB label; mapped to closest)</div>
              )}
            </li>
          ))}
          {!data.misses.length && <li className="text-muted">No misclassifications.</li>}
        </ul>
        {data.errors.length > 0 && (
          <p className="mt-2 text-xs text-alert">{data.errors.length} call(s) failed, e.g. {data.errors[0].error.slice(0, 160)}</p>
        )}
      </Card>
    </div>
  );
}

export function Experiments() {
  const live = useLive(() => api.evalRuns(), [], 15000);
  const [selected, setSelected] = useState<number | null>(null);
  const [batch, setBatch] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const runs = live.data;
  if (live.error && !runs) return <ErrorBox error={live.error} />;
  if (!runs) return <Loading />;
  // Batches = one run_eval invocation each (runs share a name), newest first.
  const batchNames = [...new Set(runs.map((r) => r.name))];
  const current = batch && batchNames.includes(batch) ? batch : batchNames[0] ?? null;
  const batchRuns = runs.filter((r) => r.name === current);
  const rows = latestPerVariant(batchRuns).filter((r) => r.status === "done");
  const running = batchRuns.filter((r) => r.status === "running");
  // Ignore an old stopped/failed attempt once a later run of the same variant has finished.
  const stopped = batchRuns.filter(
    (r) => (r.status === "stopped" || r.status === "failed") &&
      !batchRuns.some((o) => o.variant === r.variant && o.status === "done" && o.id > r.id),
  );

  const copyMd = async () => {
    try {
      await navigator.clipboard.writeText(await api.evalReportMd(current ?? undefined));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.open(`${API_URL}/api/eval/report.md`, "_blank");
    }
  };

  return (
    <div className="mb-8">
      <Card
        title="Experiments: prompt and model comparison (same held-out complaints)"
        right={
          <div className="flex items-center gap-2 print:hidden">
            {batchNames.length > 0 && (
              <select
                value={current ?? ""}
                onChange={(e) => { setBatch(e.target.value); setSelected(null); }}
                className="max-w-64 rounded border border-line px-2 py-1.5 text-sm"
                title="Run batch (one run_eval command)"
              >
                {batchNames.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            )}
            <Button variant="secondary" onClick={copyMd} disabled={!rows.length}>{copied ? "Copied" : "Copy table for report"}</Button>
          </div>
        }
      >
        {running.map((r) => (
          <div key={r.id} className="mb-3 rounded-md border border-navy/20 bg-navy-light px-3 py-2 text-sm text-navy">
            Running {r.label}: {r.n_done} / {r.n_planned} calls
            <div className="mt-1 h-1.5 rounded bg-white">
              <div className="h-1.5 rounded bg-navy" style={{ width: `${(100 * r.n_done) / Math.max(1, r.n_planned)}%` }} />
            </div>
          </div>
        ))}
        {stopped.length > 0 && !running.length && (
          <div className="mb-3 rounded-md border border-warn/40 bg-warn-light px-3 py-2 text-sm text-warn">
            <div>
              Stopped: {stopped.map((r) => `${r.label} at ${r.n_done}/${r.n_planned}`).join(" · ")}
              {stopped[0]?.metrics && (stopped[0].metrics as { note?: string }).note
                ? ` (${(stopped[0].metrics as { note?: string }).note})`
                : ""}
            </div>
            <div className="mt-1 text-xs">Finished calls are kept. Continue where it left off:</div>
            <pre className="mt-1 overflow-x-auto rounded bg-white/70 p-2 text-xs text-ink">
              docker compose exec backend python -m scripts.run_eval --resume &quot;{current}&quot;
            </pre>
          </div>
        )}
        {!rows.length && !running.length && !stopped.length ? (
          <div className="text-sm text-gray-700">
            <p>No finished runs yet. Run the evaluation from your project folder:</p>
            <pre className="mt-2 overflow-x-auto rounded bg-gray-50 p-3 text-xs">docker compose exec backend python -m scripts.run_eval --variants rules,v2,v4 --n 100 --seed 2026 --rpm 8 --name &quot;batch 2&quot;</pre>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 pr-3">Variant</th>
                  <th className="py-1 pr-3 text-right">n</th>
                  <th className="py-1 pr-3 text-right">Product acc.</th>
                  <th className="py-1 pr-3 text-right">Macro-F1</th>
                  <th className="py-1 pr-3 text-right">Issue acc.</th>
                  <th className="py-1 pr-3 text-right" title="CFPB issue is the AI's first or second choice (v4+)">Issue top-2</th>
                  <th className="py-1 pr-3 text-right" title="Share of answers that were valid CFPB labels before any correction">Valid labels</th>
                  <th className="py-1 pr-3 text-right" title="Same answer when the same complaint is classified 3 times">Consistency</th>
                  <th className="py-1 pr-3 text-right">Latency p95</th>
                  <th className="py-1 pr-3 text-right">Tokens / case</th>
                  <th className="py-1 pr-3 text-right">Cost / 1k</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const m = r.metrics;
                  return (
                    <tr
                      key={r.id}
                      onClick={() => setSelected(r.id === selected ? null : r.id)}
                      className={`cursor-pointer border-t border-line hover:bg-gray-50 ${selected === r.id ? "bg-navy-light" : ""}`}
                    >
                      <td className="py-2 pr-3">
                        <div className="font-medium">{r.label}</div>
                        <div className="text-xs text-muted">{r.model} · run #{r.id}{m.errors ? ` · ${m.errors} errors` : ""}</div>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.n}</td>
                      <Cell v={m.product_accuracy} isBest={m.product_accuracy === best(rows, "product_accuracy")} fmt={pct} />
                      <Cell v={m.product_macro_f1} isBest={m.product_macro_f1 === best(rows, "product_macro_f1")} fmt={(v) => (v == null ? "—" : v.toFixed(3))} />
                      <Cell v={m.issue_accuracy} isBest={m.issue_accuracy === best(rows, "issue_accuracy")} fmt={pct} />
                      <Cell v={m.issue_top2_accuracy} isBest={false} fmt={pct} />
                      <Cell v={m.label_valid_rate} isBest={false} fmt={pct} />
                      <Cell v={m.consistency} isBest={false} fmt={pct} />
                      <Cell v={m.latency_ms_p95} isBest={false} fmt={(v) => (v == null ? "—" : `${num(v)} ms`)} />
                      <td className="py-2 pr-3 text-right tabular-nums">{num((m.input_tokens_mean ?? 0) + (m.output_tokens_mean ?? 0))}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{m.cost_per_1k_usd == null ? "—" : `$${m.cost_per_1k_usd}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-muted">
              Runs in the selected batch (same complaints for every variant). Green = best. Accuracy is exact match with the CFPB&apos;s own labels. Click a row for
              per-product results and misclassified examples. Set PRICE_INPUT_PER_MTOK_FAST / PRICE_OUTPUT_PER_MTOK_FAST in .env to show cost.
            </p>
          </div>
        )}
      </Card>
      {selected && <Detail id={selected} />}
    </div>
  );
}
