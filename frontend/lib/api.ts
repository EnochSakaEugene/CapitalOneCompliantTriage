// Typed client for the TriageIQ FastAPI back end.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export type Risk = "low" | "medium" | "high";

export interface QueueRow {
  id: number;
  date_received: string | null;
  status: string;
  preview: string;
  product: string | null;
  issue: string | null;
  risk_level: Risk | null;
  risk_flags: string[];
  confidence: number | null;
  deadline: string | null;
  days_left: number | null;
}

export interface Citation {
  chunk_id: number;
  title: string;
  url: string | null;
  snippet: string;
  score: number;
}

export interface TraceStep {
  agent: string;
  ms: number;
  at: string;
  output: Record<string, unknown>;
}

export interface TriageResult {
  pred_product: string;
  pred_issue: string;
  sentiment: string;
  urgency: string;
  risk_level: Risk;
  risk_flags: string[];
  risk_reason: string;
  confidence: number;
  summary: string;
  route: "auto_draft" | "compliance";
  deadline: string;
  days_left: number;
  prior_similar: number;
  citations: Citation[];
  draft_reply: string | null;
  final_reply: string | null;
  reviewer: string | null;
  model_info: Record<string, unknown>;
  trace: TraceStep[];
}

export interface AuditEvent {
  id: number;
  complaint_id: number | null;
  actor: string;
  action: string;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface CaseDetail {
  id: number;
  date_received: string | null;
  status: string;
  narrative: string;
  state: string | null;
  submitted_via: string | null;
  tags: string | null;
  cfpb_labels: { product: string | null; issue: string | null; sub_product: string | null };
  triage: TriageResult | null;
  audit: AuditEvent[];
}

export interface PolicySummary {
  filename: string;
  title: string;
  url: string | null;
  sections: number;
  cited: number;
  index_state: "indexed" | "stale" | "not_indexed";
}

export interface PolicyDetail {
  filename: string;
  title: string;
  url: string | null;
  body: string;
  index_state: PolicySummary["index_state"];
  sections: { title: string; text: string; cited: number }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<{ status: string; mock_llm: boolean; complaints: number; policy_chunks: number }>("/health"),
  complaints: (params: Record<string, string | undefined> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    return request<{ total: number; items: QueueRow[] }>(`/complaints?${qs}`);
  },
  complaint: (id: number | string) => request<CaseDetail>(`/complaints/${id}`),
  triage: (id: number | string) => request<CaseDetail>(`/triage/${id}`, { method: "POST" }),
  triageBatch: (limit = 10) =>
    request<{ triaged: number[]; errors: { id: number; error: string }[] }>(`/triage-batch?limit=${limit}`, {
      method: "POST",
    }),
  approve: (id: number, reviewer: string, final_reply: string) =>
    request<CaseDetail>(`/cases/${id}/approve`, { method: "POST", body: JSON.stringify({ reviewer, final_reply }) }),
  escalate: (id: number, reviewer: string, reason: string) =>
    request<CaseDetail>(`/cases/${id}/escalate`, { method: "POST", body: JSON.stringify({ reviewer, reason }) }),
  close: (id: number, reviewer: string, reason: string, final_reply?: string) =>
    request<CaseDetail>(`/cases/${id}/close`, {
      method: "POST",
      body: JSON.stringify({ reviewer, reason, final_reply }),
    }),
  insights: () =>
    request<{
      triaged: number;
      by_status: Record<string, number>;
      by_product: [string, number][];
      by_risk: Record<string, number>;
      top_issues: [string, number][];
      flags: [string, number][];
    }>("/insights"),
  evaluation: () =>
    request<{
      n: number;
      model?: string;
      product_accuracy?: number;
      issue_accuracy?: number;
      per_product?: Record<string, { n: number; correct: number }>;
      confusion?: { actual: string; predicted: string; count: number }[];
    }>("/evaluation"),
  audit: (limit = 200) => request<AuditEvent[]>(`/audit?limit=${limit}`),
  policies: () => request<{ documents: PolicySummary[]; indexed_chunks: number }>("/policies"),
  policy: (filename: string) => request<PolicyDetail>(`/policies/${filename}`),
  savePolicy: (filename: string, p: { title: string; url: string | null; body: string; reviewer: string }) =>
    request<PolicyDetail>(`/policies/${filename}`, { method: "PUT", body: JSON.stringify(p) }),
  createPolicy: (p: { title: string; url: string | null; body: string; reviewer: string }) =>
    request<PolicyDetail>("/policies", { method: "POST", body: JSON.stringify(p) }),
  reindex: () => request<{ indexed_chunks: number }>("/policies/reindex", { method: "POST" }),
  searchPolicies: (query: string, k = 5) =>
    request<{ query: string; results: Citation[] }>("/policies/search", {
      method: "POST",
      body: JSON.stringify({ query, k }),
    }),
};
