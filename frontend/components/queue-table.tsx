"use client";
import Link from "next/link";
import type { QueueRow } from "@/lib/api";
import { DeadlineChip, FlagChips, RiskBadge, StatusPill } from "./ui";

export function QueueTable({ rows }: { rows: QueueRow[] }) {
  if (!rows.length) return <p className="py-8 text-center text-sm text-muted">No complaints match these filters.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="py-2 pr-3">ID</th>
            <th className="py-2 pr-3">Risk</th>
            <th className="py-2 pr-3">Product / issue (AI)</th>
            <th className="py-2 pr-3">Complaint</th>
            <th className="py-2 pr-3">Confidence</th>
            <th className="py-2 pr-3">Deadline</th>
            <th className="py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-b border-line align-top last:border-0 hover:bg-gray-50">
              <td className="py-3 pr-3">
                <Link href={`/cases/${r.id}`} className="font-medium text-navy hover:underline">
                  {r.id}
                </Link>
              </td>
              <td className="py-3 pr-3">
                <RiskBadge level={r.risk_level} />
                <div className="mt-1">
                  <FlagChips flags={r.risk_flags} />
                </div>
              </td>
              <td className="max-w-56 py-3 pr-3">
                <div className="font-medium">{r.product ?? "—"}</div>
                <div className="text-xs text-muted">{r.issue}</div>
              </td>
              <td className="max-w-md py-3 pr-3 text-gray-700">
                <Link href={`/cases/${r.id}`} className="hover:underline">
                  {r.preview}…
                </Link>
              </td>
              <td className="py-3 pr-3 tabular-nums">
                {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—"}
              </td>
              <td className="py-3 pr-3">
                <DeadlineChip daysLeft={r.days_left} />
              </td>
              <td className="py-3">
                <StatusPill status={r.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
