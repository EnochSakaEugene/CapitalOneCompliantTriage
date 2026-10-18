"use client";
import { QueueTable } from "@/components/queue-table";
import { Card, ErrorBox, Loading, PageHeader, RefreshControl } from "@/components/ui";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";

export default function EscalationsPage() {
  const { data, error, updatedAt, loading, refresh } = useLive(() =>
    api.complaints({ status: "escalated", limit: "200" }),
  );
  const rows = data?.items ?? null;

  return (
    <>
      <PageHeader
        title="Escalations"
        subtitle="High-risk complaints routed to Compliance: fraud, identity theft, discrimination, servicemember and legal threats."
        actions={<RefreshControl updatedAt={updatedAt} loading={loading} onRefresh={refresh} />}
      />
      <Card right={data ? <span className="text-sm text-muted">{data.total} escalated</span> : undefined}>{error && !rows ? <ErrorBox error={error} /> : rows ? <QueueTable rows={rows} /> : <Loading />}</Card>
    </>
  );
}
