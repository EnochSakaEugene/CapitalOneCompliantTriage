"use client";
import { useCallback, useEffect, useState } from "react";
import { QueueTable } from "@/components/queue-table";
import { Button, Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api, type QueueRow } from "@/lib/api";

const STATUSES = ["", "new", "awaiting_review", "escalated", "approved", "closed"];
const RISKS = ["", "high", "medium", "low"];

export default function QueuePage() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [risk, setRisk] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mock, setMock] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.complaints({ status, risk, limit: "100" });
      setRows(res.items);
      setTotal(res.total);
      setError(null);
    } catch (e) {
      setError(String(e));
    }
  }, [status, risk]);

  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    api.health().then((h) => setMock(h.mock_llm)).catch(() => {});
  }, []);

  const runBatch = async () => {
    setBusy(true);
    try {
      await api.triageBatch(10);
      await load();
    } catch (e) {
      setError(String(e));
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
          <Button onClick={runBatch} disabled={busy}>
            {busy ? "Running agents…" : "Triage next 10 incoming"}
          </Button>
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
