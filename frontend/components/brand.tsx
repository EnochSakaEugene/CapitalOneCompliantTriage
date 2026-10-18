// TriageIQ's own logo (original design). Deliberately not a bank logo: this is a
// student prototype that analyses Capital One as a public case study.
export function Logo({ light = false, size = 28 }: { light?: boolean; size?: number }) {
  const fg = light ? "#ffffff" : "#00304f";
  return (
    <span className="flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={light ? "#ffffff" : "#004879"} />
        {/* funnel = triage, check = human-approved */}
        <path d="M7 9h18l-7 8v6l-4 2v-8z" fill={light ? "#004879" : "#ffffff"} />
        <path d="M19.5 22.5l2.2 2.2 4.3-4.6" stroke="#d03027" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-lg font-bold tracking-tight" style={{ color: fg }}>
        Triage<span style={{ color: light ? "#ffffff" : "#004879" }}>IQ</span>
      </span>
    </span>
  );
}
