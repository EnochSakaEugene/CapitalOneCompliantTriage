"use client";
// Minimal horizontal bar list (no chart library needed for v1).
export function Bars({ data, color = "bg-navy" }: { data: [string, number][]; color?: string }) {
  const max = Math.max(1, ...data.map(([, v]) => v));
  if (!data.length) return <p className="text-sm text-muted">No data yet. Triage some complaints first.</p>;
  return (
    <ul className="space-y-2">
      {data.map(([label, v]) => (
        <li key={label} className="text-sm">
          <div className="flex justify-between gap-3">
            <span className="truncate">{label.replaceAll("_", " ")}</span>
            <span className="tabular-nums text-muted">{v}</span>
          </div>
          <div className="mt-1 h-2 rounded bg-gray-100">
            <div className={`h-2 rounded ${color}`} style={{ width: `${(v / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
