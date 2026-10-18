"use client";
// Public landing page. Menus and data appear only after login (top-right "Log in").
import Link from "next/link";
import { Slider } from "@/components/slides";
import { navFor } from "@/lib/access";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  { title: "Agentic workflow", body: "Classify → research → route → draft or escalate, with every step traced." },
  { title: "Retrieval-augmented answers", body: "Replies grounded in a reviewed knowledge base of consumer-finance rules." },
  { title: "Built-in governance", body: "Role-based access, human approval, fairness checks, risk register and audit log." },
];

export default function Landing() {
  const { user } = useAuth();
  const home = user ? navFor(user.role)[0]?.href ?? "/insights" : null;
  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-navy">Case study · Capital One complaint triage</p>
          <h1 className="mt-1 text-3xl font-semibold text-navy-dark md:text-4xl">Agentic complaint triage for regulated banking</h1>
          <p className="mt-2 max-w-2xl text-muted">
            TriageIQ helps complaint analysts and compliance officers prioritise consumer complaints, cite the right rules and
            respond on time, with a person approving every outcome.
          </p>
        </div>
        {user ? (
          <Link href={home!} className="rounded-md bg-navy px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-dark">
            Open your workspace →
          </Link>
        ) : (
          <p className="text-sm text-muted">Use <span className="font-semibold text-navy">Log in</span> at the top right to continue.</p>
        )}
      </div>

      <Slider />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-lg border border-line bg-white p-5 shadow-sm">
            <div className="text-sm font-semibold text-navy-dark">{f.title}</div>
            <p className="mt-1 text-sm text-muted">{f.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
