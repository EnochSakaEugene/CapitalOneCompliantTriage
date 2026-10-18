"use client";
import { useEffect, useState } from "react";
import { QueueTable } from "@/components/queue-table";
import { Card, ErrorBox, Loading, PageHeader } from "@/components/ui";
import { api, type QueueRow } from "@/lib/api";

export default function EscalationsPage() {
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .complaints({ status: "escalated", limit: "200" })
      .then((r) => setRows(r.items))
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <>
      <PageHeader
        title="Escalations"
        subtitle="High-risk complaints routed to Compliance: fraud, identity theft, discrimination, servicemember and legal threats."
      />
      <Card>{error ? <ErrorBox error={error} /> : rows ? <QueueTable rows={rows} /> : <Loading />}</Card>
    </>
  );
}
