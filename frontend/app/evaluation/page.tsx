"use client";
import { Card, ErrorBox, Loading, PageHeader, RefreshControl } from "@/components/ui";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";

const pct = (v?: number) => (v == null ? "—" : `${(v * 100).toFixed(1)}%`);

export default function EvaluationPage() {
  const { data: d, error, updatedAt, loading, refresh } = useLive(() => api.evaluation());
  if (error && !d) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  return (
    <>
      <PageHeader
        title="Evaluation"
        subtitle="AI labels compared with the CFPB's own product and issue labels on triaged complaints."
        actions={<RefreshControl updatedAt={updatedAt} loading={loading} onRefresh={refresh} />}
      />
      {d.n === 0 ? (
        <Card>
          <p className="text-sm text-muted">No triaged complaints yet.</p>
        </Card>
      ) : (
        <>
          <div className="mb-4 grid gap-4 sm:grid-cols-3">
            <Card>
              <div className="text-xs uppercase tracking-wide text-muted">Product accuracy</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-navy-dark">{pct(d.product_accuracy)}</div>
              <div className="text-xs text-muted">Target ≥ 85%</div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-wide text-muted">Issue accuracy (exact match)</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-navy-dark">{pct(d.issue_accuracy)}</div>
            </Card>
            <Card>
              <div className="text-xs uppercase tracking-wide text-muted">Sample · model</div>
              <div className="mt-1 text-3xl font-semibold tabular-nums text-navy-dark">{d.n}</div>
              <div className="text-xs text-muted">{d.model}</div>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Accuracy by actual product">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted">
                  <tr>
                    <th className="py-1">Product</th>
                    <th className="py-1 text-right">Cases</th>
                    <th className="py-1 text-right">Accuracy</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(d.per_product ?? {})
                    .sort((a, b) => b[1].n - a[1].n)
                    .map(([p, v]) => (
                      <tr key={p} className="border-t border-line">
                        <td className="py-1.5 pr-2">{p}</td>
                        <td className="py-1.5 text-right tabular-nums">{v.n}</td>
                        <td className="py-1.5 text-right tabular-nums">{pct(v.correct / v.n)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </Card>
            <Card title="Most common (actual → predicted) pairs">
              <table className="w-full text-sm">
                <tbody>
                  {(d.confusion ?? []).map((c, i) => (
                    <tr key={i} className="border-t border-line first:border-0">
                      <td className={`py-1.5 pr-2 ${c.actual === c.predicted ? "" : "text-alert"}`}>
                        {c.actual} → {c.predicted}
                      </td>
                      <td className="py-1.5 text-right tabular-nums">{c.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
