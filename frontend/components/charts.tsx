"use client";
// Small dependency-free SVG charts: single-series columns over time (with hover tooltip),
// a threshold line option, and a sparkline. One series each, so the title names it (no legend).
import { useState } from "react";

const NAVY = "#004879";
const GRID = "#e5e7eb";

export function Columns({
  data,
  format = (v: number) => String(v),
  threshold,
  thresholdLabel,
  height = 160,
  color = NAVY,
}: {
  data: { label: string; value: number | null }[];
  format?: (v: number) => string;
  threshold?: number;
  thresholdLabel?: string;
  height?: number;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const vals = data.map((d) => d.value ?? 0);
  const max = Math.max(threshold ?? 0, ...vals, 1e-9);
  const W = 600, H = height, padL = 4, padB = 18, padT = 8;
  const n = Math.max(1, data.length);
  const slot = (W - padL) / n;
  const bw = Math.max(2, Math.min(28, slot - 2));
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  if (!data.length) return <p className="text-sm text-muted">No data yet.</p>;
  const h = hover !== null ? data[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" onMouseLeave={() => setHover(null)}>
        <line x1={padL} x2={W} y1={H - padB} y2={H - padB} stroke={GRID} />
        {threshold !== undefined && (
          <g>
            <line x1={padL} x2={W} y1={y(threshold)} y2={y(threshold)} stroke="#b45309" strokeDasharray="4 4" />
            {thresholdLabel && <text x={W - 2} y={y(threshold) - 4} textAnchor="end" fontSize="10" fill="#6b7280">{thresholdLabel}</text>}
          </g>
        )}
        {data.map((d, i) => {
          const x = padL + i * slot + (slot - bw) / 2;
          const v = d.value;
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)}>
              <rect x={padL + i * slot} y={0} width={slot} height={H} fill="transparent" />
              {v !== null && v > 0 && (
                <path
                  d={H - padB - y(v) > 5 && bw > 8
                    ? `M${x} ${H - padB} V${y(v) + 4} q0 -4 4 -4 h${bw - 8} q4 0 4 4 V${H - padB} Z`
                    : `M${x} ${H - padB} V${Math.min(y(v), H - padB - 1)} h${bw} V${H - padB} Z`}
                  fill={color}
                  opacity={hover === null || hover === i ? 1 : 0.45}
                />
              )}
            </g>
          );
        })}
        {[0, data.length - 1].filter((i, k, a) => a.indexOf(i) === k).map((i) => (
          <text key={i} x={padL + i * slot + slot / 2} y={H - 4} textAnchor={i === 0 ? "start" : "end"} fontSize="10" fill="#6b7280">
            {data[i].label}
          </text>
        ))}
      </svg>
      {h && (
        <div className="pointer-events-none absolute right-0 top-0 rounded-md border border-line bg-white px-2 py-1 text-xs shadow">
          <span className="text-muted">{h.label}: </span>
          <span className="font-semibold tabular-nums">{h.value === null ? "—" : format(h.value)}</span>
        </div>
      )}
    </div>
  );
}

export function Sparkline({ values, highlightFrom }: { values: number[]; highlightFrom?: number }) {
  const W = 120, H = 28;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [values.length > 1 ? (i / (values.length - 1)) * W : W / 2, H - 2 - (v / max) * (H - 4)]);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const cut = highlightFrom !== undefined && values.length > 1 ? (highlightFrom / (values.length - 1)) * W : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-7 w-28" aria-hidden="true">
      {cut !== null && <rect x={cut} y={0} width={W - cut} height={H} fill="#fbeaea" />}
      <path d={d} stroke={NAVY} strokeWidth="2" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" | "alert" }) {
  const color = tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "alert" ? "text-alert" : "text-navy-dark";
  return (
    <div className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
