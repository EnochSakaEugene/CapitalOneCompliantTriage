"use client";
// Landing-page slider: three original illustrations (inline SVG, no external images).
import { useEffect, useRef, useState } from "react";

const NAVY = "#004879";
const NAVY_DARK = "#00304f";
const RED = "#d03027";
const AMBER = "#b45309";
const GREEN = "#15803d";

function QueueArt() {
  const rows = [
    { c: RED, w: 150, t: "High risk · fraud" },
    { c: AMBER, w: 120, t: "Medium · fees" },
    { c: GREEN, w: 170, t: "Low · billing" },
    { c: GREEN, w: 135, t: "Low · rewards" },
  ];
  return (
    <svg viewBox="0 0 520 320" className="h-full w-full" role="img" aria-label="Illustration of a prioritised complaint queue">
      <rect x="30" y="30" width="460" height="260" rx="18" fill="#ffffff" opacity="0.96" />
      <rect x="30" y="30" width="460" height="44" rx="18" fill={NAVY_DARK} />
      <rect x="30" y="56" width="460" height="18" fill={NAVY_DARK} />
      <circle cx="58" cy="52" r="6" fill="#ffffff" opacity="0.5" />
      <rect x="74" y="47" width="120" height="10" rx="5" fill="#ffffff" opacity="0.5" />
      {rows.map((r, i) => (
        <g key={i} transform={`translate(54 ${92 + i * 46})`}>
          <rect width="412" height="36" rx="10" fill="#f5f7fa" />
          <rect x="12" y="10" width="64" height="16" rx="8" fill={r.c} opacity="0.15" />
          <rect x="18" y="15" width="52" height="6" rx="3" fill={r.c} />
          <rect x="92" y="11" width={r.w} height="6" rx="3" fill={NAVY} opacity="0.75" />
          <rect x="92" y="22" width={r.w - 40} height="5" rx="2.5" fill="#94a3b8" />
          <rect x="350" y="12" width="46" height="12" rx="6" fill={NAVY} opacity="0.12" />
        </g>
      ))}
      <g transform="translate(410 230)">
        <circle r="34" fill={NAVY} />
        <path d="M-14 -6h28l-11 12v9l-6 3v-12z" fill="#ffffff" />
      </g>
    </svg>
  );
}

function RagArt() {
  return (
    <svg viewBox="0 0 520 320" className="h-full w-full" role="img" aria-label="Illustration of agents retrieving policy documents">
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${60 + i * 16} ${70 + i * 16})`}>
          <rect width="150" height="190" rx="12" fill="#ffffff" opacity={0.7 + i * 0.15} />
          {[0, 1, 2, 3, 4, 5].map((j) => (
            <rect key={j} x="18" y={24 + j * 24} width={j % 2 ? 90 : 114} height="7" rx="3.5" fill={NAVY} opacity="0.25" />
          ))}
        </g>
      ))}
      <rect x="110" y="150" width="96" height="9" rx="4.5" fill={RED} opacity="0.8" />
      <g transform="translate(205 190)">
        <circle r="34" fill="none" stroke="#ffffff" strokeWidth="9" />
        <line x1="24" y1="24" x2="52" y2="52" stroke="#ffffff" strokeWidth="11" strokeLinecap="round" />
      </g>
      {[
        [340, 80, "Classify"],
        [400, 160, "Research"],
        [340, 240, "Draft"],
      ].map(([x, y, label], i) => (
        <g key={i}>
          <circle cx={x as number} cy={y as number} r="30" fill="#ffffff" />
          <circle cx={x as number} cy={y as number} r="12" fill={i === 1 ? RED : NAVY} />
          <text x={(x as number) + 40} y={(y as number) + 5} fill="#ffffff" fontSize="16" fontWeight="600" fontFamily="sans-serif">
            {label}
          </text>
        </g>
      ))}
      <path d="M352 106 Q395 120 392 132 M392 188 Q390 210 356 218" stroke="#ffffff" strokeWidth="3" fill="none" strokeDasharray="6 6" />
    </svg>
  );
}

function OversightArt() {
  return (
    <svg viewBox="0 0 520 320" className="h-full w-full" role="img" aria-label="Illustration of human review and an audit trail">
      <path d="M140 50 L220 80 V150 C220 205 183 240 140 260 C97 240 60 205 60 150 V80 Z" fill="#ffffff" />
      <path d="M108 152 l24 24 l46 -50" stroke={GREEN} strokeWidth="14" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="300" y1="60" x2="300" y2="270" stroke="#ffffff" strokeWidth="4" opacity="0.6" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i} transform={`translate(300 ${78 + i * 58})`}>
          <circle r="11" fill={i === 3 ? GREEN : "#ffffff"} />
          <rect x="26" y="-15" width="170" height="30" rx="9" fill="#ffffff" opacity="0.95" />
          <rect x="38" y="-6" width={i === 3 ? 90 : 120} height="6" rx="3" fill={NAVY} opacity="0.7" />
          <rect x="38" y="4" width="70" height="4" rx="2" fill="#94a3b8" />
        </g>
      ))}
    </svg>
  );
}

export const SLIDES = [
  {
    title: "Every complaint triaged in seconds",
    body: "AI agents classify each complaint against the CFPB taxonomy, flag fraud, discrimination and servicemember risks, and set the 15-day response deadline.",
    Art: QueueArt,
  },
  {
    title: "Answers grounded in policy",
    body: "A research agent retrieves the relevant regulations (Reg Z, Reg E, FCRA, UDAAP and more) so draft replies cite real rules instead of guessing.",
    Art: RagArt,
  },
  {
    title: "People stay in control",
    body: "High-risk cases go straight to Compliance, every reply needs analyst approval, and every AI step and human decision is recorded in the audit log.",
    Art: OversightArt,
  },
];

export function Slider() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduce = useRef(false);

  useEffect(() => {
    reduce.current = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  }, []);

  useEffect(() => {
    if (paused || reduce.current) return;
    const id = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), 6000);
    return () => window.clearInterval(id);
  }, [paused]);

  const go = (n: number) => setI((n + SLIDES.length) % SLIDES.length);

  return (
    <section
      className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-dark via-navy to-[#0b5c96] text-white shadow-lg"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
      aria-label="What TriageIQ does"
    >
      <div className="relative h-[420px] md:h-[380px]">
        {SLIDES.map((s, n) => (
          <div
            key={s.title}
            className={`absolute inset-0 grid items-center gap-6 px-8 py-8 transition-opacity duration-700 md:grid-cols-2 md:px-14 ${
              n === i ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={n !== i}
            role="group"
            aria-label={`Slide ${n + 1} of ${SLIDES.length}`}
          >
            <div>
              <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-white/60">
                {String(n + 1).padStart(2, "0")} / {String(SLIDES.length).padStart(2, "0")}
              </div>
              <h2 className="text-3xl font-semibold leading-tight md:text-4xl">{s.title}</h2>
              <p className="mt-4 max-w-md text-base text-white/80">{s.body}</p>
            </div>
            <div className="hidden h-full md:block">
              <s.Art />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-5 left-8 flex items-center gap-3 md:left-14">
        <button onClick={() => go(i - 1)} aria-label="Previous slide" className="rounded-full bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
          ‹
        </button>
        {SLIDES.map((s, n) => (
          <button
            key={s.title}
            onClick={() => go(n)}
            aria-label={`Go to slide ${n + 1}`}
            className={`h-2 rounded-full transition-all ${n === i ? "w-8 bg-white" : "w-2 bg-white/40 hover:bg-white/70"}`}
          />
        ))}
        <button onClick={() => go(i + 1)} aria-label="Next slide" className="rounded-full bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
          ›
        </button>
      </div>
    </section>
  );
}
