"use client";
// Public landing page. Menus and data appear only after login (top-right "Log in").
import Link from "next/link";
import { Slider } from "@/components/slides";
import { CAPABILITIES, ROLE_INFO, ROLE_LABELS, navFor } from "@/lib/access";
import { useAuth } from "@/lib/auth";

const FEATURES = [
  { title: "Agentic workflow", body: "Classify → research → route → draft or escalate, with every step traced." },
  { title: "Retrieval-augmented answers", body: "Replies grounded in a reviewed knowledge base of consumer-finance rules." },
  { title: "Built-in governance", body: "Role-based access, human approval, fairness checks, risk register and audit log." },
];

function Check({ on }: { on: boolean }) {
  return on ? (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-ok-light text-ok" aria-label="Yes">
      <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden="true">
        <path d="M3 8.5l3 3 7-7" stroke="currentColor" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span className="inline-flex h-6 w-6 items-center justify-center text-gray-300" aria-label="No">–</span>
  );
}

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

      <section className="mt-12" aria-labelledby="roles-heading">
        <p className="text-xs font-semibold uppercase tracking-widest text-navy">Roles and access</p>
        <h2 id="roles-heading" className="mt-1 text-2xl font-semibold text-navy-dark">Who uses TriageIQ and what they can do</h2>
        <p className="mt-2 max-w-3xl text-sm text-muted">
          Every signed-in user can see every page, so the whole team shares one view of complaints, AI quality and risk. What
          changes by role is what you can <em>do</em>: the back end enforces these rules on every request, and every action is
          recorded in the audit log under the person who took it.
        </p>

        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ROLE_INFO.map((r) => {
            const mine = user?.role === r.role;
            return (
              <div
                key={r.role}
                className={`rounded-lg border bg-white p-5 shadow-sm ${mine ? "border-navy ring-2 ring-navy/20" : "border-line"}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold text-navy-dark">{ROLE_LABELS[r.role]}</div>
                  {mine && <span className="rounded-full bg-navy px-2 py-0.5 text-[10px] font-semibold uppercase text-white">You</span>}
                </div>
                <div className="mt-0.5 text-xs text-muted">{r.who}</div>
                <p className="mt-3 text-sm text-ink">{r.summary}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line bg-canvas text-left text-xs uppercase tracking-wide text-muted">
                <th className="px-4 py-3 font-semibold">Capability</th>
                {ROLE_INFO.map((r) => (
                  <th key={r.role} className={`px-3 py-3 text-center font-semibold ${user?.role === r.role ? "text-navy" : ""}`}>
                    {ROLE_LABELS[r.role]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CAPABILITIES.map((c) => (
                <tr key={c.label} className="border-b border-line last:border-0">
                  <td className="px-4 py-2.5 text-ink">{c.label}</td>
                  {ROLE_INFO.map((r) => (
                    <td key={r.role} className={`px-3 py-2.5 text-center ${user?.role === r.role ? "bg-navy-light/50" : ""}`}>
                      <Check on={c.roles.includes(r.role)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
