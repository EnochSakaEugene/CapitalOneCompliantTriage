"use client";
import { useEffect, useState } from "react";
import { QueueTable } from "@/components/queue-table";
import { Button, Card, ErrorBox, Loading, PageHeader, RefreshControl } from "@/components/ui";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";

const STATUSES = ["", "new", "awaiting_review", "escalated", "approved", "closed"];
const RISKS = ["", "high", "medium", "low"];

export default function QueuePage() {
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [busy, setBusy] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [mock, setMock] = useState<boolean | null>(null);
  const live = useLive(() => api.complaints({ status, risk, limit: "100" }), [status, risk]);
  const rows = live.data?.items ?? null;
  const total = live.data?.total ?? 0;
  const error = batchError ?? (rows ? null : live.error);
  const load = live.refresh;
  useEffect(() => {
    api.health().then((h) => setMock(h.mock_llm)).catch(() => {});
  }, []);

  const runBatch = async () => {
    setBusy(true);
    try {
      setBatchError(null);
      await api.triageBatch(10);
      await load();
    } catch (e) {
      setBatchError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Triage Queue"
        subtitle="AI-triaged complaints, most urgent first. Every reply needs analyst approval."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <RefreshControl updatedAt={live.updatedAt} loading={live.loading} onRefresh={load} />
            <Button onClick={runBatch} disabled={busy}>
              {busy ? "Running agents…" : "Triage next 10 incoming"}
            </Button>
          </div>
        }
      />
      {mock && (
        <div className="mb-4 rounded-md border border-warn/40 bg-warn-light px-3 py-2 text-sm text-warn">
          Mock mode: no Gemini or OpenAI key is set, so rule-based logic stands in for the LLM.
        </div>
      )}
      <Card
        right={
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">{total} complaints</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded border border-line px-2 py-1">
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s ? s.replace("_", " ") : "All statuses"}
                </option>
              ))}
            </select>
            <select value={risk} onChange={(e) => setRisk(e.target.value)} className="rounded border border-line px-2 py-1">
              {RISKS.map((r) => (
                <option key={r} value={r}>
                  {r ? `${r} risk` : "All risk levels"}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {error ? <ErrorBox error={error} /> : rows ? <QueueTable rows={rows} /> : <Loading />}
      </Card>
    </>
  );
}
