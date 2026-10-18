// Which roles can open which pages and do which actions. Mirrors the back-end checks
// (the back end is the real enforcement; this just hides what a role can't use).
export type Role = "analyst" | "compliance" | "cx_leader" | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  analyst: "Complaint Analyst",
  compliance: "Compliance Officer",
  cx_leader: "CX Leader",
  admin: "Administrator",
};

export const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/queue", label: "Triage Queue", roles: ["analyst", "compliance", "admin"] },
  { href: "/escalations", label: "Escalations", roles: ["analyst", "compliance", "admin"] },
  { href: "/insights", label: "Insights", roles: ["analyst", "compliance", "cx_leader", "admin"] },
  { href: "/evaluation", label: "Evaluation", roles: ["analyst", "compliance", "cx_leader", "admin"] },
  { href: "/audit", label: "Audit Log", roles: ["compliance", "admin"] },
  { href: "/knowledge", label: "Knowledge Base", roles: ["analyst", "compliance", "cx_leader", "admin"] },
  { href: "/governance", label: "Governance", roles: ["compliance", "cx_leader", "admin"] },
];

export function navFor(role: Role | undefined) {
  return role ? NAV.filter((n) => n.roles.includes(role)) : [];
}

export function canOpen(path: string, role: Role | undefined): boolean {
  if (path === "/") return true;
  if (!role) return false;
  if (path.startsWith("/cases")) return ["analyst", "compliance", "admin"].includes(role);
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
