"use client";
// Landing-page slider: four original illustrated scenes (inline SVG, no external images),
// each showing one part of the TriageIQ goal: triage fast, ground answers in policy,
// keep people in control, and measure everything.
import { useEffect, useRef, useState, type ReactNode } from "react";

const NAVY = "#004879";
const NAVY_DARK = "#00304f";
const SKY = "#cfe0ee";
const RED = "#d03027";
const AMBER = "#d98a1c";
const GREEN = "#1f9d55";
const SLATE = "#94a3b8";
const FONT = "Inter, ui-sans-serif, system-ui, sans-serif";

/* ---------- shared drawing helpers ---------- */

function T({ x, y, children, size = 12, fill = NAVY_DARK, weight = 600, anchor = "start" as const }: {
  x: number; y: number; children: ReactNode; size?: number; fill?: string; weight?: number; anchor?: "start" | "middle" | "end";
}) {
  return (
    <text x={x} y={y} fontSize={size} fontWeight={weight} fill={fill} fontFamily={FONT} textAnchor={anchor}>
      {children}
    </text>
  );
}

function Lines({ x, y, widths, gap = 12, color = SLATE, h = 5 }: { x: number; y: number; widths: number[]; gap?: number; color?: string; h?: number }) {
  return (
    <>
      {widths.map((w, i) => (
        <rect key={i} x={x} y={y + i * gap} width={w} height={h} rx={h / 2} fill={color} opacity={0.55} />
      ))}
    </>
  );
}

/** Flat-style person, shoulders up. `back` draws them from behind (looking at a screen). */
function Person({ x, y, s = 1, skin, hair, shirt, long = false, back = false }: {
  x: number; y: number; s?: number; skin: string; hair: string; shirt: string; long?: boolean; back?: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {long && <path d="M-25 -22 C-30 -54 30 -54 25 -22 L28 18 C14 14 -14 14 -28 18 Z" fill={hair} />}
      <path d="M-48 78 C-48 34 -30 14 0 14 C30 14 48 34 48 78 Z" fill={shirt} />
      <rect x="-8" y="-4" width="16" height="20" rx="6" fill={skin} />
      {back ? (
        <>
          <circle cx="-22" cy="-20" r="5" fill={skin} />
          <circle cx="22" cy="-20" r="5" fill={skin} />
          <circle cx="0" cy="-22" r="23" fill={hair} />
        </>
      ) : (
        <>
          <circle cx="0" cy="-22" r="23" fill={skin} />
          <path d="M-24 -22 C-26 -50 26 -52 24 -24 C14 -36 -6 -40 -24 -22 Z" fill={hair} />
          <circle cx="-8" cy="-20" r="2.2" fill={NAVY_DARK} />
          <circle cx="8" cy="-20" r="2.2" fill={NAVY_DARK} />
          <path d="M-7 -9 Q0 -4 7 -9" stroke={NAVY_DARK} strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M-14 16 L0 32 L14 16" fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.75" />
        </>
      )}
    </g>
  );
}

function Glow({ id, cx, cy, r }: { id: string; cx: number; cy: number; r: number }) {
  return (
    <>
      <defs>
        <radialGradient id={id}>
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx={cx} cy={cy} r={r} fill={`url(#${id})`} />
    </>
  );
}

function Shadow({ id }: { id: string }) {
  return (
    <defs>
      <filter id={id} x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#001a2c" floodOpacity="0.35" />
      </filter>
    </defs>
  );
}

/* ---------- scene 1: incoming complaints sorted by AI agents ---------- */

function TriageScene() {
  const lanes = [
    { y: 92, c: RED, a: "High risk", b: "Routed to Compliance" },
    { y: 176, c: AMBER, a: "Medium", b: "Analyst review" },
    { y: 260, c: GREEN, a: "Low", b: "Draft reply ready" },
  ];
  return (
    <svg viewBox="0 0 600 400" className="h-full w-full" role="img" aria-label="Complaints from mail, phone and web flowing into AI agents and sorted into high, medium and low risk lanes">
      <Shadow id="s1" />
      <Glow id="g1" cx={290} cy={200} r={190} />
      {/* incoming channels */}
      <g className="tiq-float" filter="url(#s1)">
        <rect x="28" y="66" width="78" height="52" rx="8" fill="#ffffff" />
        <path d="M30 70 L67 98 L104 70" fill="none" stroke={NAVY} strokeWidth="3" />
        <circle cx="100" cy="70" r="9" fill={RED} />
        <T x={100} y={74} size={10} fill="#fff" anchor="middle">!</T>
      </g>
      <g className="tiq-float" style={{ animationDelay: "1.2s" }} filter="url(#s1)">
        <rect x="40" y="152" width="50" height="86" rx="10" fill={NAVY_DARK} stroke="#ffffff" strokeWidth="3" />
        <rect x="47" y="164" width="36" height="60" rx="4" fill="#ffffff" />
        <rect x="51" y="170" width="24" height="10" rx="5" fill={SKY} />
        <rect x="56" y="186" width="24" height="10" rx="5" fill={NAVY} opacity="0.8" />
        <rect x="51" y="202" width="20" height="10" rx="5" fill={SKY} />
      </g>
      <g className="tiq-float" style={{ animationDelay: "2.4s" }} filter="url(#s1)">
        <rect x="26" y="276" width="84" height="66" rx="8" fill="#ffffff" />
        <rect x="26" y="276" width="84" height="14" rx="7" fill={SKY} />
        <Lines x={36} y={298} widths={[60, 44, 52]} gap={11} />
        <rect x="80" y="326" width="22" height="9" rx="4.5" fill={NAVY} />
      </g>
      {/* flows into the hub */}
      {["M108 92 C190 92 200 170 236 188", "M92 196 C150 196 190 200 228 200", "M112 308 C190 308 200 228 236 212"].map((d) => (
        <path key={d} d={d} stroke="#ffffff" strokeOpacity="0.7" strokeWidth="2.5" fill="none" strokeDasharray="4 8" className="tiq-flow" />
      ))}
      {/* AI agent hub */}
      <circle cx="290" cy="200" r="84" fill="none" stroke="#ffffff" strokeWidth="2" className="tiq-pulse" />
      <circle cx="290" cy="200" r="62" fill="#ffffff" filter="url(#s1)" />
      <path d="M262 176 h56 l-21 25 v18 l-14 7 v-25 z" fill={NAVY} />
      <path d="M300 222 l6 6 l12 -13" stroke={RED} strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <T x={290} y={306} size={13} fill="#ffffff" anchor="middle">Classify · Research · Route</T>
      {/* output lanes */}
      {lanes.map((l) => (
        <g key={l.a}>
          <path d={`M352 200 C390 200 380 ${l.y + 23} 412 ${l.y + 23}`} stroke={l.c} strokeWidth="3" fill="none" strokeDasharray="4 8" className="tiq-flow" />
          <g filter="url(#s1)">
            <rect x="412" y={l.y} width="164" height="46" rx="10" fill="#ffffff" />
            <rect x="412" y={l.y} width="7" height="46" rx="3.5" fill={l.c} />
            <rect x="430" y={l.y + 9} width="60" height="14" rx="7" fill={l.c} opacity="0.15" />
            <T x={460} y={l.y + 20} size={9.5} fill={l.c} anchor="middle" weight={700}>{l.a}</T>
            <T x={430} y={l.y + 37} size={11}>{l.b}</T>
          </g>
        </g>
      ))}
      {/* deadline badge */}
      <g filter="url(#s1)">
        <rect x="412" y="330" width="164" height="38" rx="19" fill={NAVY_DARK} stroke="#ffffff" strokeOpacity="0.5" />
        <circle cx="434" cy="349" r="10" fill="none" stroke="#ffffff" strokeWidth="2.5" />
        <path d="M434 343 v6 l4 3" stroke="#ffffff" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <T x={452} y={353} size={11.5} fill="#ffffff">15-day deadline set</T>
      </g>
    </svg>
  );
}

/* ---------- scene 2: analyst reading a draft grounded in regulations ---------- */

function GroundedScene() {
  const books = [
    { x: 40, h: 150, w: 34, c: "#ffffff", t: "REG Z" },
    { x: 78, h: 132, w: 30, c: SKY, t: "REG E" },
    { x: 112, h: 156, w: 36, c: "#ffffff", t: "FCRA" },
    { x: 152, h: 124, w: 30, c: RED, t: "UDAAP" },
    { x: 186, h: 142, w: 32, c: SKY, t: "SCRA" },
  ];
  const shelf = 268;
  return (
    <svg viewBox="0 0 600 400" className="h-full w-full" role="img" aria-label="An analyst at a monitor reading a draft reply that cites regulations retrieved from a shelf of rulebooks">
      <Shadow id="s2" />
      <Glow id="g2" cx={400} cy={180} r={200} />
      {/* bookshelf of regulations */}
      {books.map((b, i) => (
        <g key={b.t} filter="url(#s2)">
          <rect x={b.x} y={shelf - b.h} width={b.w} height={b.h} rx="4" fill={b.c} />
          <rect x={b.x + 4} y={shelf - b.h + 10} width={b.w - 8} height="4" rx="2" fill={b.c === RED ? "#ffffff" : NAVY} opacity="0.5" />
          <rect x={b.x + 4} y={shelf - 18} width={b.w - 8} height="4" rx="2" fill={b.c === RED ? "#ffffff" : NAVY} opacity="0.5" />
          <text
            x={b.x + b.w / 2 + 4}
            y={shelf - b.h / 2}
            transform={`rotate(-90 ${b.x + b.w / 2 + 4} ${shelf - b.h / 2})`}
            textAnchor="middle"
            fontSize="11"
            fontWeight="700"
            fontFamily={FONT}
            fill={b.c === RED ? "#ffffff" : NAVY_DARK}
            letterSpacing="1"
          >
            {b.t}
          </text>
          {i === 1 && <circle cx={b.x + b.w / 2} cy={shelf - b.h - 16} r="5" fill={RED} className="tiq-pulse" />}
        </g>
      ))}
      <rect x="28" y={shelf} width="204" height="10" rx="3" fill="#ffffff" opacity="0.85" />
      {/* magnifier = retrieval */}
      <g className="tiq-float" transform="translate(150 70)">
        <circle cx="0" cy="0" r="26" fill="#ffffff" fillOpacity="0.15" stroke="#ffffff" strokeWidth="7" />
        <line x1="19" y1="19" x2="40" y2="40" stroke="#ffffff" strokeWidth="9" strokeLinecap="round" />
      </g>
      {/* retrieval beams to the citations */}
      <path d="M95 120 C190 40 300 70 386 186" stroke="#ffffff" strokeOpacity="0.75" strokeWidth="2.5" fill="none" strokeDasharray="4 8" className="tiq-flow" />
      <path d="M57 112 C170 0 330 60 470 186" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="2" fill="none" strokeDasharray="4 8" className="tiq-flow" />
      {/* monitor with draft reply */}
      <g filter="url(#s2)">
        <rect x="282" y="58" width="296" height="210" rx="12" fill={NAVY_DARK} />
        <rect x="292" y="68" width="276" height="190" rx="6" fill="#ffffff" />
        <rect x="292" y="68" width="276" height="26" rx="6" fill={SKY} />
        <T x={304} y={86} size={11}>Draft reply · grounded</T>
        <rect x="508" y="74" width="52" height="14" rx="7" fill={GREEN} opacity="0.2" />
        <T x={534} y={85} size={9} fill={GREEN} anchor="middle" weight={700}>RAG</T>
        <Lines x={304} y={106} widths={[240, 210, 228]} gap={13} />
        <rect x="304" y="148" width="104" height="22" rx="11" fill="#ffffff" stroke={RED} strokeWidth="2" />
        <T x={356} y={163} size={10} fill={RED} anchor="middle" weight={700}>Reg E § 1005.11</T>
        <rect x="414" y="148" width="104" height="22" rx="11" fill="#ffffff" stroke={NAVY} strokeWidth="2" />
        <T x={466} y={163} size={10} fill={NAVY} anchor="middle" weight={700}>Reg Z § 1026.13</T>
        <Lines x={304} y={184} widths={[232, 190, 214, 120]} gap={13} />
        <rect x="270" y="268" width="320" height="10" rx="5" fill="#ffffff" opacity="0.25" />
        <rect x="414" y="268" width="32" height="34" fill={NAVY_DARK} />
      </g>
      {/* desk + analyst seen from behind */}
      <rect x="250" y="300" width="350" height="14" rx="4" fill="#ffffff" opacity="0.9" />
      <Person x={430} y={372} s={0.95} skin="#c58c62" hair="#2b2118" shirt="#0b5c96" back />
    </svg>
  );
}

/* ---------- scene 3: analyst and compliance officer approve or escalate ---------- */

function OversightScene() {
  return (
    <svg viewBox="0 0 600 400" className="h-full w-full" role="img" aria-label="An analyst and a compliance officer reviewing an AI-drafted case and choosing approve or escalate, with an audit log">
      <Shadow id="s3" />
      <Glow id="g3" cx={300} cy={190} r={210} />
      {/* case card */}
      <g filter="url(#s3)">
        <rect x="150" y="40" width="300" height="236" rx="14" fill="#ffffff" />
        <T x={170} y={70} size={13}>Case review</T>
        <rect x="358" y="56" width="74" height="20" rx="10" fill={RED} opacity="0.15" />
        <T x={395} y={70} size={10} fill={RED} anchor="middle" weight={700}>High risk</T>
        <rect x="170" y="86" width="260" height="1.5" fill="#e5e7eb" />
        <rect x="170" y="98" width="44" height="44" rx="10" fill={SKY} />
        <path d="M182 110 h20 l-8 9 v7 l-5 3 v-10 z" fill={NAVY} />
        <Lines x={226} y={102} widths={[190, 160, 176]} gap={13} />
        <rect x="170" y="154" width="260" height="56" rx="8" fill="#f5f7fa" />
        <Lines x={182} y={166} widths={[220, 196, 150]} gap={12} color={NAVY} />
        <rect x="170" y="226" width="118" height="34" rx="8" fill={GREEN} />
        <path d="M188 243 l6 6 l11 -12" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <T x={250} y={248} size={12} fill="#ffffff" anchor="middle">Approve</T>
        <rect x="300" y="226" width="130" height="34" rx="8" fill="#ffffff" stroke={RED} strokeWidth="2" />
        <T x={365} y={248} size={12} fill={RED} anchor="middle">Escalate</T>
      </g>
      {/* shield */}
      <g transform="translate(300 300)" filter="url(#s3)">
        <path d="M0 -26 L30 -14 V8 C30 30 15 44 0 52 C-15 44 -30 30 -30 8 V-14 Z" fill="#ffffff" />
        <path d="M-12 10 l9 9 l17 -19" stroke={GREEN} strokeWidth="5.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* people */}
      <Person x={78} y={292} s={1.05} skin="#8d5a3b" hair="#1b1410" shirt="#ffffff" />
      <T x={78} y={392} size={11} fill="#ffffff" anchor="middle">Analyst</T>
      <Person x={522} y={292} s={1.05} skin="#f0c7a4" hair="#6b3e1f" shirt={RED} long />
      <T x={522} y={392} size={11} fill="#ffffff" anchor="middle">Compliance</T>
      {/* audit trail */}
      <path d="M150 352 H450" stroke="#ffffff" strokeOpacity="0.4" strokeWidth="2" />
      {[170, 250, 350, 430].map((x, i) => (
        <g key={x}>
          <circle cx={x} cy={352} r="7" fill={i === 3 ? GREEN : "#ffffff"} />
          <rect x={x - 22} y={364} width="44" height="5" rx="2.5" fill="#ffffff" opacity="0.5" />
        </g>
      ))}
      <T x={300} y={392} size={10.5} fill="#ffffff" anchor="middle" weight={500}>Every step written to the audit log</T>
    </svg>
  );
}

/* ---------- scene 4: evaluation dashboard ---------- */

function MeasuredScene() {
  const bars = [62, 92, 118, 138];
  return (
    <svg viewBox="0 0 600 400" className="h-full w-full" role="img" aria-label="An evaluation dashboard comparing prompt versions on accuracy, consistency, latency and cost">
      <Shadow id="s4" />
      <Glow id="g4" cx={300} cy={200} r={210} />
      <g filter="url(#s4)">
        <rect x="30" y="36" width="500" height="300" rx="14" fill="#ffffff" />
        <rect x="30" y="36" width="500" height="38" rx="14" fill={NAVY_DARK} />
        <rect x="30" y="58" width="500" height="16" fill={NAVY_DARK} />
        <T x={50} y={60} size={12} fill="#ffffff">Evaluation · held-out CFPB complaints</T>
        <T x={512} y={60} size={9.5} fill={SKY} anchor="end" weight={500}>illustration</T>
        {/* bar chart */}
        <T x={50} y={100} size={10.5} fill="#5b6b7a" weight={600}>Accuracy by prompt version</T>
        <line x1="50" y1="262" x2="250" y2="262" stroke="#e5e7eb" strokeWidth="2" />
        {bars.map((h, i) => (
          <g key={i}>
            <rect x={62 + i * 46} y={262 - h} width="30" height={h} rx="5" fill={i === 3 ? RED : NAVY} opacity={i === 3 ? 1 : 0.45 + i * 0.18} />
            <T x={77 + i * 46} y={280} size={10} fill="#5b6b7a" anchor="middle">{`v${i + 1}`}</T>
          </g>
        ))}
        {/* donut */}
        <T x={290} y={100} size={10.5} fill="#5b6b7a" weight={600}>Consistency</T>
        <circle cx="330" cy="170" r="44" fill="none" stroke="#e5e7eb" strokeWidth="14" />
        <circle cx="330" cy="170" r="44" fill="none" stroke={GREEN} strokeWidth="14" strokeDasharray="236 276" transform="rotate(-90 330 170)" strokeLinecap="round" />
        <path d="M316 170 l9 9 l17 -18" stroke={GREEN} strokeWidth="4.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        {/* latency line */}
        <T x={402} y={100} size={10.5} fill="#5b6b7a" weight={600}>Latency ↓</T>
        <path d="M402 140 L426 160 L450 152 L474 186 L498 180 L512 196" stroke={NAVY} strokeWidth="3" fill="none" strokeLinejoin="round" />
        <path d="M402 140 L426 160 L450 152 L474 186 L498 180 L512 196 V214 H402 Z" fill={NAVY} opacity="0.08" />
        <line x1="402" y1="214" x2="512" y2="214" stroke="#e5e7eb" strokeWidth="2" />
        {/* KPI tiles */}
        {["Cost / case", "p95 latency"].map((k, i) => (
          <g key={k}>
            <rect x={290 + i * 116} y="236" width="106" height="48" rx="8" fill="#f5f7fa" />
            <T x={300 + i * 116} y={254} size={10} fill="#5b6b7a" weight={600}>{k}</T>
            <rect x={300 + i * 116} y="264" width={i ? 54 : 70} height="8" rx="4" fill={NAVY} opacity="0.55" />
          </g>
        ))}
        <rect x="50" y="300" width="460" height="20" rx="6" fill={SKY} opacity="0.5" />
        <T x={60} y={314} size={10} fill={NAVY_DARK} weight={600}>Baseline vs. improved prompt · same test set · same seed</T>
      </g>
      <Person x={530} y={322} s={0.95} skin="#d9a27a" hair="#3a2a1c" shirt="#0b5c96" />
    </svg>
  );
}

export const SLIDES = [
  {
    kicker: "Triage",
    title: "Every complaint triaged in seconds",
    body: "AI agents read each complaint, classify it against the CFPB product and issue taxonomy, flag fraud, discrimination and servicemember risks, and start the 15-day response clock.",
    chips: ["CFPB taxonomy", "Risk flags", "15-day clock"],
    Art: TriageScene,
  },
  {
    kicker: "Retrieval-augmented",
    title: "Answers grounded in real rules",
    body: "A research agent retrieves the relevant regulations (Reg Z, Reg E, FCRA, UDAAP, SCRA and more) so every draft reply cites its sources instead of guessing.",
    chips: ["12 regulation summaries", "Cited in drafts", "Editable knowledge base"],
    Art: GroundedScene,
  },
  {
    kicker: "Human in the loop",
    title: "People stay in control",
    body: "High-risk cases go straight to Compliance, every reply needs an analyst's approval, and every AI step and human decision is written to the audit log.",
    chips: ["Human approval", "Role-based access", "Audit trail"],
    Art: OversightScene,
  },
  {
    kicker: "Evaluation",
    title: "Measured, not assumed",
    body: "Each prompt version is scored on held-out CFPB complaints for accuracy, consistency, latency and cost, so every improvement is backed by evidence.",
    chips: ["Baseline vs. improved", "Latency & cost", "Consistency checks"],
    Art: MeasuredScene,
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
    const id = window.setInterval(() => setI((n) => (n + 1) % SLIDES.length), 7000);
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
      {/* subtle dot grid texture */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.07]" aria-hidden="true">
        <defs>
          <pattern id="tiq-dots" width="22" height="22" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.5" fill="#ffffff" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#tiq-dots)" />
      </svg>
      <div className="relative h-[620px] sm:h-[600px] md:h-[460px]">
        {SLIDES.map((s, n) => (
          <div
            key={s.title}
            className={`absolute inset-0 grid grid-rows-[auto_1fr] items-center gap-2 px-6 pb-16 pt-6 transition-all duration-700 md:grid-cols-[5fr_7fr] md:grid-rows-1 md:gap-6 md:px-12 md:pb-14 md:pt-8 ${
              n === i ? "translate-x-0 opacity-100" : "pointer-events-none translate-x-4 opacity-0"
            }`}
            aria-hidden={n !== i}
            role="group"
            aria-label={`Slide ${n + 1} of ${SLIDES.length}: ${s.title}`}
          >
            <div className="order-2 md:order-1">
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-white/70">
                <span className="rounded-full bg-alert px-2 py-0.5 text-white">{String(n + 1).padStart(2, "0")}</span>
                {s.kicker}
              </div>
              <h2 className="text-2xl font-semibold leading-tight md:text-4xl">{s.title}</h2>
              <p className="mt-3 max-w-md text-sm text-white/80 md:text-base">{s.body}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {s.chips.map((c) => (
                  <span key={c} className="rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </div>
            <div className="order-1 h-56 sm:h-64 md:order-2 md:h-full">
              <s.Art />
            </div>
          </div>
        ))}
      </div>
      <div className="absolute bottom-5 left-6 flex items-center gap-3 md:left-12">
        <button onClick={() => go(i - 1)} aria-label="Previous slide" className="rounded-full bg-white/15 px-3 py-1 text-sm hover:bg-white/25">
          ‹
        </button>
        {SLIDES.map((s, n) => (
          <button
            key={s.title}
            onClick={() => go(n)}
            aria-label={`Go to slide ${n + 1}`}
            aria-current={n === i}
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
