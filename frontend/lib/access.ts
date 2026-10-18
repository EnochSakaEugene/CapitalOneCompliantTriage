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
export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/queue", label: "Triage Queue", roles: ALL },
  { href: "/escalations", label: "Escalations", roles: ALL },
  { href: "/insights", label: "Insights", roles: ALL },
  { href: "/evaluation", label: "Evaluation", roles: ALL },
  { href: "/audit", label: "Audit Log", roles: ALL },
  { href: "/knowledge", label: "Knowledge Base", roles: ALL },
  { href: "/governance", label: "Governance", roles: ALL },
];

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
};

// What each role is for and what it can do. Used by the landing page and kept in sync with
// `can` above and the back-end `require_roles` checks.
export const ROLE_INFO: { role: Role; who: string; summary: string }[] = [
  { role: "analyst", who: "Front-line complaint handler", summary: "Works the queue: runs AI triage, edits and approves draft replies, and escalates risky cases to Compliance." },
  { role: "compliance", who: "Regulatory and risk owner", summary: "Does everything an analyst can, plus closes escalated cases, curates the regulation knowledge base and owns the AI risk register." },
  { role: "cx_leader", who: "Customer-experience manager", summary: "Read-only oversight: follows complaint trends, AI quality, governance and the audit log without changing cases." },
  { role: "admin", who: "System owner", summary: "Full access to every page and action, for setup, demos and support." },
];

const A: Role[] = ["analyst", "compliance", "admin"];
const C: Role[] = ["compliance", "admin"];
export const CAPABILITIES: { label: string; roles: Role[] }[] = [
  { label: "View every page (queue, cases, insights, evaluation, knowledge base, governance, audit log)", roles: ALL },
  { label: "Download evaluation results and reports", roles: ALL },
  { label: "Run AI triage on incoming complaints", roles: A },
  { label: "Edit and approve AI-drafted replies", roles: A },
  { label: "Escalate a case to Compliance", roles: A },
  { label: "Close escalated cases", roles: C },
  { label: "Edit the regulation knowledge base and re-index it", roles: C },
  { label: "Add and update risks in the risk register", roles: C },
  { label: "Change own password", roles: ALL },
];
