"use client";
// Compatibility layer: pages read the current role/username from the logged-in user.
import type { ReactNode } from "react";
import { ROLE_LABELS, type Role } from "@/lib/access";
import { useAuth } from "@/lib/auth";

export type { Role };
export { ROLE_LABELS };

export function RoleProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useRole() {
  const { user } = useAuth();
  return { role: (user?.role ?? "analyst") as Role, username: user?.username ?? "", setRole: () => {} };
}
