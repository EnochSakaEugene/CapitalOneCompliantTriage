// Typed client for the TriageIQ FastAPI back end.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
export const TOKEN_KEY = "triageiq-token";

export function authHeaders(): Record<string, string> {
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t ? { Authorization: `Bearer ${t}` } : {};
  } catch {
    return {};
  }
}

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

export interface FairnessRow {
  group: string;
  n: number;
  high_risk_rate: number | null;
  escalation_rate: number | null;
  product_accuracy: number | null;
  avg_confidence: number;
  small_sample: boolean;
}

export interface Governance {
  oversight: {
    triaged: number;
    ai_escalated: number;
    approved: number;
    approved_with_edits: number;
    human_escalations: number;
    overrides: number;
    closed: number;
    reviewed: number;
    edit_rate: number | null;
    approve_without_edit_rate: number | null;
    override_rate: number | null;
    pii_redactions: number;
    policy_changes: number;
  };
  model_card: {
    provider: string;
    classification_model: string;
    drafting_model: string;
    embedding_model: string;
    reasoning_effort: string | null;
    policy_sections: number;
    data_window: [string | null, string | null];
    complaints_loaded: number;
    evaluation: { n: number; product_accuracy: number | null; issue_accuracy: number | null };
    intended_use: string;
    out_of_scope: string;
    limitations: string[];
  };
  fairness: { min_group: number; by_tag: FairnessRow[]; by_state: FairnessRow[] };
  indicators: Record<string, number | null>;
}

export type Level = "low" | "medium" | "high";
export interface RiskItem {
  id: number;
  risk: string;
  category: string;
  likelihood: Level;
  impact: Level;
  mitigation: string;
  indicator: string | null;
  owner: string;
  status: "open" | "monitoring" | "mitigated";
  updated_at: string | null;
}

export interface EvalMetrics {
  n?: number;
  errors?: number;
  product_accuracy?: number | null;
  issue_accuracy?: number | null;
  issue_top2_accuracy?: number | null;
  product_macro_f1?: number | null;
  label_valid_rate?: number | null;
  high_risk_rate?: number | null;
  latency_ms_mean?: number | null;
  latency_ms_p95?: number | null;
  input_tokens_mean?: number;
  output_tokens_mean?: number;
  cost_per_1k_usd?: number | null;
  consistency?: number | null;
  consistency_n?: number;
}

export interface EvalRunSummary {
  id: number;
  name: string;
  variant: string;
  label: string;
  model: string;
  status: "running" | "done" | "stopped" | "failed";
  n_planned: number;
  n_done: number;
  metrics: EvalMetrics;
  config: Record<string, unknown>;
  started_at: string | null;
  finished_at: string | null;
}

export interface EvalRunDetail extends EvalRunSummary {
  per_product: { product: string; n: number; product_accuracy: number | null; issue_accuracy: number | null }[];
  misses: { complaint_id: number; true_product: string; pred_product: string; true_issue: string; pred_issue: string; raw_issue: string }[];
  errors: { complaint_id: number; error: string }[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("triageiq:unauthorized"));
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
  governance: () => request<Governance>("/governance"),
  evalRuns: () => request<EvalRunSummary[]>("/eval/runs"),
  evalBatches: () =>
    request<{ name: string; runs: number; done: number; running: number; n: number | null; started_at: string | null }[]>(
      "/eval/batches",
    ),
  evalRun: (id: number) => request<EvalRunDetail>(`/eval/runs/${id}`),
  evalReportMd: async (name?: string) => {
    const qs = name ? `?name=${encodeURIComponent(name)}` : "";
    const res = await fetch(`${API_URL}/api/eval/report.md${qs}`, { cache: "no-store", headers: authHeaders() });
    return res.text();
  },
  downloadEvalCsv: async (id: number) => {
    const res = await fetch(`${API_URL}/api/eval/runs/${id}/cases.csv`, { headers: authHeaders() });
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement("a"), { href: url, download: `eval_run_${id}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  },
  risks: () => request<RiskItem[]>("/governance/risks"),
  saveRisk: (r: Omit<RiskItem, "updated_at" | "indicator"> & { reviewer: string }) =>
    request<RiskItem>(`/governance/risks/${r.id}`, { method: "PUT", body: JSON.stringify(r) }),
  createRisk: (r: Partial<RiskItem> & { risk: string; category: string; reviewer: string }) =>
    request<RiskItem>("/governance/risks", { method: "POST", body: JSON.stringify(r) }),
};
