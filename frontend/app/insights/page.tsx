"use client";
import { useEffect, useState } from "react";
import { Bars } from "@/components/bars";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api } from "@/lib/api";

type Insights = Awaited<ReturnType<typeof api.insights>>;

export default function InsightsPage() {
  const [d, setD] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.insights().then(setD).catch((e) => setError(String(e)));
  }, []);
  if (error) return <ErrorBox error={error} />;
  if (!d) return <Loading />;
  const risk = d.by_risk;
  return (
    <>
      <PageHeader title="Insights" subtitle="Complaint patterns across triaged cases, for root-cause and CX teams." />
      <div className="mb-4 grid gap-4 sm:grid-cols-4">
        {[
          ["Triaged", d.triaged, "text-navy-dark"],
          ["High risk", risk.high ?? 0, "text-alert"],
          ["Medium risk", risk.medium ?? 0, "text-warn"],
          ["Awaiting review", d.by_status.awaiting_review ?? 0, "text-navy"],
        ].map(([label, value, cls]) => (
          <Card key={String(label)}>
            <div className="text-xs uppercase tracking-wide text-muted">{label}</div>
            <div className={`mt-1 text-3xl font-semibold tabular-nums ${cls}`}>{value}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="By product">
          <Bars data={d.by_product} />
        </Card>
        <Card title="Risk flags">
          <Bars data={d.flags} color="bg-alert" />
        </Card>
        <div className="lg:col-span-2">
          <Card title="Top product / issue combinations (spike watch)">
            <Bars data={d.top_issues} />
          </Card>
        </div>
      </div>
    </>
  );
}
