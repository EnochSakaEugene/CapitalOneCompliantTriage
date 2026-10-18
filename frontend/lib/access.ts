// Which roles can open which pages and do which actions. Mirrors the back-end checks
// (the back end is the real enforcement; this just hides what a role can't use).
export type Role = "analyst" | "compliance" | "cx_leader" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  analyst: "Complaint Analyst",
  compliance: "Compliance Officer",
  cx_leader: "CX Leader",
  admin: "Administrator",
};

const ALL: Role[] = ["analyst", "compliance", "cx_leader", "admin"];

// Every signed-in role sees every page; what a role can *do* on a page is in `can` below.
export type NavItem = { href: string; label: string; roles: Role[]; group: "Work" | "Analyze" | "Govern"; hint: string };
export const NAV: NavItem[] = [
  { group: "Work", href: "/queue", label: "Triage Queue", roles: ALL, hint: "AI-triaged complaints, most urgent first" },
  { group: "Work", href: "/intake", label: "New Complaint", roles: ALL, hint: "Submit a complaint and watch the agents work" },
  { group: "Work", href: "/escalations", label: "Escalations", roles: ALL, hint: "High-risk cases for Compliance" },
  { group: "Work", href: "/deadlines", label: "Deadlines", roles: ALL, hint: "15-day response clock: overdue and at risk" },
  { group: "Analyze", href: "/insights", label: "Insights", roles: ALL, hint: "Volumes, risk mix and emerging issues" },
  { group: "Analyze", href: "/evaluation", label: "Evaluation", roles: ALL, hint: "Accuracy, model comparison and RAG ablation" },
  { group: "Analyze", href: "/monitoring", label: "Monitoring", roles: ALL, hint: "Live quality, drift, cost and corrections" },
  { group: "Analyze", href: "/business", label: "Business Case", roles: ALL, hint: "ROI, roadmap and recommendation" },
  { group: "Govern", href: "/governance", label: "Governance", roles: ALL, hint: "Oversight, fairness, red team, risk register" },
  { group: "Govern", href: "/knowledge", label: "Knowledge Base", roles: ALL, hint: "Regulation summaries used by RAG" },
  { group: "Govern", href: "/reports", label: "Weekly Report", roles: ALL, hint: "Printable compliance summary" },
  { group: "Govern", href: "/audit", label: "Audit Log", roles: ALL, hint: "Every AI step and human decision" },
];

export const NAV_GROUPS = ["Work", "Analyze", "Govern"] as const;

export function navFor(role: Role | undefined) {
  return role ? NAV.filter((n) => n.roles.includes(role)) : [];
}

export function canOpen(path: string, role: Role | undefined): boolean {
  if (path === "/") return true;
  if (!role) return false;
  const item = NAV.find((n) => path === n.href || path.startsWith(n.href + "/"));
  return item ? item.roles.includes(role) : true;
}

export const can = {
  triage: (r?: Role) => !!r && ["analyst", "compliance", "admin"].includes(r),
  review: (r?: Role) => !!r && ["analyst", "compliance", "admin"].includes(r),
  close: (r?: Role) => !!r && ["compliance", "admin"].includes(r),
  editPolicies: (r?: Role) => !!r && ["compliance", "admin"].includes(r),
  editRisks: (r?: Role) => !!r && ["compliance", "admin"].includes(r),
  intake: (r?: Role) => !!r && ["analyst", "compliance", "admin"].includes(r),
  correct: (r?: Role) => !!r && ["analyst", "compliance", "admin"].includes(r),
  promote: (r?: Role) => !!r && ["compliance", "admin"].includes(r),
};

// What each role is for and what it can do. Used by the landing page and kept in sync with
// `can` above and the back-end `require_roles` checks.
export const ROLE_INFO: { role: Role; who: string; summary: string }[] = [
  { role: "analyst", who: "Front-line complaint handler", summary: "Works the queue: submits and triages complaints, edits and approves draft replies, corrects AI labels, and escalates risky cases." },
  { role: "compliance", who: "Regulatory and risk owner", summary: "Does everything an analyst can, plus closes escalated cases, curates the knowledge base, promotes corrections into the AI's examples and owns the risk register." },
  { role: "cx_leader", who: "Customer-experience manager", summary: "Read-only oversight: follows trends, emerging issues, deadlines, AI quality, the business case and weekly reports without changing cases." },
  { role: "admin", who: "System owner", summary: "Full access to every page and action, for setup, demos and support." },
];

const A: Role[] = ["analyst", "compliance", "admin"];
const C: Role[] = ["compliance", "admin"];
export const CAPABILITIES: { label: string; roles: Role[] }[] = [
  { label: "View every page (work queues, analytics, governance, reports, audit log)", roles: ALL },
  { label: "Download evaluation results and print the weekly compliance report", roles: ALL },
  { label: "Submit a new complaint and run AI triage", roles: A },
  { label: "Edit and approve AI-drafted replies (with a hallucination re-check)", roles: A },
  { label: "Correct the AI's product or issue label", roles: A },
  { label: "Escalate a case to Compliance", roles: A },
  { label: "Close escalated cases", roles: C },
  { label: "Promote analyst corrections into the AI's examples", roles: C },
  { label: "Edit the regulation knowledge base and re-index it", roles: C },
  { label: "Add and update risks in the risk register", roles: C },
  { label: "Change own password", roles: ALL },
];
