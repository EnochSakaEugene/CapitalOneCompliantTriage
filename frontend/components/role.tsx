"use client";
// Demo role switcher. v1 has no real login: the chosen role is kept in the browser
// and used as the reviewer name on approvals/escalations. Replace with real auth later.
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Role = "analyst" | "compliance" | "cx_leader";
export const ROLE_LABELS: Record<Role, string> = {
  analyst: "Complaint Analyst",
  compliance: "Compliance Officer",
  cx_leader: "CX Leader",
};

const RoleContext = createContext<{ role: Role; setRole: (r: Role) => void }>({
  role: "analyst",
  setRole: () => {},
});

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRoleState] = useState<Role>("analyst");
  useEffect(() => {
    try {
      const saved = localStorage.getItem("triageiq-role") as Role | null;
      if (saved && saved in ROLE_LABELS) setRoleState(saved);
    } catch {}
  }, []);
  const setRole = (r: Role) => {
    setRoleState(r);
    try {
      localStorage.setItem("triageiq-role", r);
    } catch {}
  };
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>;
}

export const useRole = () => useContext(RoleContext);
