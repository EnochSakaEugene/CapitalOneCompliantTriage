"use client";
import Link from "next/link";
import { Card, ErrorBox, Loading, PageHeader, RefreshControl } from "@/components/ui";
import { api } from "@/lib/api";
import { useLive } from "@/lib/useLive";

export default function AuditPage() {
  const { data: rows, error, updatedAt, loading, refresh } = useLive(() => api.audit(300));
  if (error && !rows) return <ErrorBox error={error} />;
  if (!rows) return <Loading />;
  return (
    <>
      <PageHeader
        title="Audit Log"
        subtitle="Every agent step and human decision, newest first. Supports the governance framework and risk register."
        actions={<RefreshControl updatedAt={updatedAt} loading={loading} onRefresh={refresh} />}
      />
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-line uppercase tracking-wide text-muted">
              <tr>
                <th className="py-2 pr-3">Time (UTC)</th>
                <th className="py-2 pr-3">Complaint</th>
                <th className="py-2 pr-3">Actor</th>
                <th className="py-2 pr-3">Action</th>
                <th className="py-2">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} className="border-b border-line align-top last:border-0">
                  <td className="whitespace-nowrap py-2 pr-3 tabular-nums text-muted">{e.created_at?.slice(0, 19).replace("T", " ")}</td>
                  <td className="py-2 pr-3">
                    {e.complaint_id && (
                      <Link href={`/cases/${e.complaint_id}`} className="text-navy hover:underline">
                        {e.complaint_id}
                      </Link>
                    )}
                  </td>
                  <td className={`py-2 pr-3 font-medium ${e.actor.startsWith("user:") ? "text-navy" : ""}`}>{e.actor}</td>
                  <td className="py-2 pr-3">{e.action}</td>
                  <td className="max-w-xl py-2 text-gray-600">
                    <code className="break-words">{JSON.stringify(e.detail)}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
