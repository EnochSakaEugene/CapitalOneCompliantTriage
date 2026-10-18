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
  source?: string;
  language?: string | null;
  grounding_score?: number | null;
}

export interface Grounding {
  score: number | null;
  claims: { sentence: string; supported: boolean; source: string | null }[];
  unsupported: string[];
  flagged_phrases: string[];
  method: string;
  ms: number;
}

export interface Injection {
  detected: boolean;
  rules: string[];
  matches: { rule: string; excerpt: string }[];
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
  tokens_in?: number;
  tokens_out?: number;
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
  grounding: Grounding | null;
  injection: Injection | null;
  language: string;
  translation: string | null;
  corrected_product: string | null;
  corrected_issue: string | null;
  corrected_by: string | null;
  edit_ratio: number | null;
  total_ms: number | null;
  tokens: { in: number; out: number };
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
  source: string;
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

export interface SimilarCase {
  id: number;
  similarity: number;
  method: string;
  date_received: string | null;
  product: string | null;
  issue: string | null;
  status: string;
  outcome: string;
  reply: string | null;
  preview: string;
}

export interface DeadlineItem {
  id: number;
  status: string;
  risk_level: Risk;
  product: string;
  issue: string;
  deadline: string;
  days_left: number;
  bucket: "overdue" | "due_3_days" | "due_7_days" | "on_track";
  preview: string;
}

export interface Deadlines {
  as_of: string;
  offset_days: number;
  items: DeadlineItem[];
  counts: Record<DeadlineItem["bucket"], number>;
  open: number;
  responded: number;
  on_time_rate: number | null;
  summary: string;
}

export interface DayStats {
  day?: string;
  triaged: number;
  high_risk_rate: number | null;
  escalation_rate: number | null;
  latency_ms_mean: number;
  tokens: number;
  cost_usd: number | null;
  grounded_mean: number | null;
  confidence_mean: number | null;
  injection_flags: number;
}

export interface Monitoring {
  days: number;
  daily: (DayStats & { day: string })[];
  summary: Partial<DayStats> & {
    reviewed: number;
    label_override_rate: number | null;
    approve_without_edit_rate: number | null;
    edit_ratio_mean: number | null;
    drafts_with_unsupported: number | null;
    product_mix_psi: number | null;
    languages: Record<string, number>;
  };
  alerts: { level: "warn" | "info"; metric: string; message: string }[];
  prices_set: boolean;
  thresholds: Record<string, number>;
}

export interface EmergingAlert {
  product: string;
  issue: string;
  recent_total: number;
  recent_weekly: number;
  baseline_weekly: number;
  ratio: number;
  sparkline: number[];
}

export interface Emerging {
  window: { recent_from: string; recent_to: string; baseline_from: string; weeks: number; baseline_weeks: number } | null;
  series: { week: string; count: number }[];
  alerts: EmergingAlert[];
  note?: string;
}

export interface ThemeSummary {
  themes: string[];
  likely_root_cause: string;
  suggested_action: string;
  method: string;
  sample_size: number;
}

export interface WeeklyReport {
  period: { start: string; end: string };
  generated_at: string;
  volume: {
    triaged: number;
    new_intake: number;
    by_risk: Record<string, number>;
    by_product: [string, number][];
    escalated_to_compliance: number;
    approved: number;
    closed: number;
  };
  risk_flags: [string, number][];
  deadlines: { overdue: number; due_3_days: number; due_7_days: number; on_track: number; open: number; on_time_rate: number | null };
  ai_quality: {
    grounded_mean: number | null;
    drafts_checked: number;
    drafts_with_unsupported: number;
    label_corrections: number;
    reviewed: number;
    edit_ratio_mean: number | null;
    prompt_injection_flags: number;
    non_english: number;
    ai_cost_usd: number | null;
  };
  emerging: EmergingAlert[];
  open_high_impact_risks: { risk: string; owner: string; status: string }[];
  human_oversight: { approvals: number; escalations_by_people: number; closures: number; logins: number };
}

export interface BusinessBaseline {
  loaded_by_month: [string, number][];
  loaded_total: number;
  cases_measured: number;
  measured_from_live_llm: boolean;
  ai_seconds_per_case: number | null;
  tokens_per_case: number | null;
  ai_cost_per_case_usd: number | null;
  prices_set: boolean;
  escalation_rate: number | null;
  grounded_mean: number | null;
  edit_ratio_mean: number | null;
  best_eval: { name: string; variant: string; model: string; product_accuracy: number; issue_accuracy: number | null; n: number } | null;
  mock: boolean;
}

export interface RedTeam {
  cases: { id: string; type: string; attack: boolean; text: string; detected: boolean; rules: string[]; correct: boolean }[];
  attacks: number;
  caught: number;
  catch_rate: number | null;
  benign: number;
  false_positives: number;
  false_positive_rate: number | null;
  real_checked: number;
  real_flagged: number;
  real_flag_rate: number | null;
  real_flagged_examples: string[];
}

export interface Correction {
  id: number;
  ai_product: string;
  ai_issue: string;
  product: string;
  issue: string;
  by: string | null;
  promoted: boolean;
}

export interface Approach {
  key: string;
  approach: string;
  family: string;
  cost: string;
  privacy: string;
  scalability: string;
  maintenance: string;
  outputs: string;
}

export interface DraftingRun extends Omit<EvalRunSummary, "metrics"> {
  metrics: {
    n?: number;
    grounded_mean?: number;
    fully_grounded_rate?: number;
    unsupported_claims_mean?: number;
    claims_mean?: number;
    latency_ms_mean?: number;
    output_tokens_mean?: number;
    errors?: number;
    cases?: { id: number; score: number | null; claims: number; unsupported: string[]; ms: number; reply: string }[];
  };
}

export type StreamEvent =
  | { type: "start"; complaint_id: number; steps: string[] }
  | ({ type: "step" } & TraceStep)
  | { type: "done"; complaint_id: number; status: string; route: string; risk_level: Risk }
  | { type: "error"; error: string };

/** POST that reads a Server-Sent Events stream (fetch, so the auth header can be sent). */
export async function streamTriage(id: number, onEvent: (e: StreamEvent) => void): Promise<void> {
  const res = await fetch(`${API_URL}/api/triage/${id}/stream`, { method: "POST", headers: authHeaders() });
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("triageiq:unauthorized"));
  if (!res.ok || !res.body) throw new Error(`${res.status} ${res.statusText}: ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (line) onEvent(JSON.parse(line.slice(6)) as StreamEvent);
    }
  }
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
  redteam: () => request<RedTeam>("/governance/redteam"),
  taxonomy: () => request<Record<string, string[]>>("/meta/taxonomy"),
  similar: (id: number, k = 3) => request<SimilarCase[]>(`/cases/${id}/similar?k=${k}`),
  correct: (id: number, product: string, issue: string) =>
    request<CaseDetail>(`/cases/${id}/correct`, { method: "POST", body: JSON.stringify({ product, issue }) }),
  verifyReply: (id: number, reply: string) =>
    request<Grounding>(`/cases/${id}/verify`, { method: "POST", body: JSON.stringify({ reply }) }),
  intakeSamples: () => request<{ label: string; channel: string; state: string; text: string }[]>("/intake/samples"),
  intake: (narrative: string, channel: string, state?: string) =>
    request<{ id: number }>("/intake", { method: "POST", body: JSON.stringify({ narrative, channel, state: state || null }) }),
  deadlines: (offset = 0) => request<Deadlines>(`/deadlines?offset_days=${offset}`),
  monitoring: (days = 30) => request<Monitoring>(`/monitoring?days=${days}`),
  emerging: () => request<Emerging>("/insights/emerging"),
  themeSummary: (product: string, issue: string) =>
    request<ThemeSummary>("/insights/emerging/summary", { method: "POST", body: JSON.stringify({ product, issue }) }),
  weeklyReport: (end?: string) => request<WeeklyReport>(`/reports/weekly${end ? `?end=${end}` : ""}`),
  business: () => request<BusinessBaseline>("/business/baseline"),
  corrections: () => request<{ items: Correction[]; promoted: number }>("/corrections"),
  promote: (id: number) => request<{ ok: boolean }>(`/fewshot/${id}`, { method: "POST" }),
  demote: (id: number) => request<{ ok: boolean }>(`/fewshot/${id}`, { method: "DELETE" }),
  approaches: () => request<Approach[]>("/eval/approaches"),
  draftingRuns: () => request<DraftingRun[]>("/eval/drafting"),
  saveRisk: (r: Omit<RiskItem, "updated_at" | "indicator"> & { reviewer: string }) =>
    request<RiskItem>(`/governance/risks/${r.id}`, { method: "PUT", body: JSON.stringify(r) }),
  createRisk: (r: Partial<RiskItem> & { risk: string; category: string; reviewer: string }) =>
    request<RiskItem>("/governance/risks", { method: "POST", body: JSON.stringify(r) }),
};
