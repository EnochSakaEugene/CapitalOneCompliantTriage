import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { RoleProvider } from "@/components/role";
import { Shell } from "@/components/shell";

export const metadata: Metadata = {
  title: "TriageIQ",
  description: "Agentic complaint triage prototype (GWU ISTM 6227)",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">
        <RoleProvider>
          <Shell>{children}</Shell>
        </RoleProvider>
      </body>
    </html>
  );
}
