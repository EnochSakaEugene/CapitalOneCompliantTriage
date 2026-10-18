"use client";
// Knowledge Base: the policy documents the Policy Research Agent searches (RAG).
// Browse them, test retrieval, edit or add a policy, and rebuild the index.
import { useEffect, useState } from "react";
import { useRole } from "@/components/role";
import { Button, Card, ErrorBox, Loading, PageHeader, RefreshControl } from "@/components/ui";
import { api, type Citation, type PolicyDetail, type PolicySummary } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { can } from "@/lib/access";

const NEW_TEMPLATE = `## Section heading
Plain-language summary of the rule or policy. Each "## " heading becomes one searchable section.

## Another section
Keep sections short and focused on one topic.`;

const SAMPLE_QUERIES = [
  "I paid my auto loan early through the app but it was marked late and I was charged a fee",
  "Someone opened a credit card in my name and it is on my credit report",
  "My savings account has been frozen for weeks and nobody will explain why",
  "I was scammed into sending money through Zelle and the bank refused to refund it",
];

function StateBadge({ state }: { state: PolicySummary["index_state"] }) {
  const map = {
    indexed: ["Indexed", "bg-ok-light text-ok"],
    stale: ["Changed – re-index", "bg-warn-light text-warn"],
    not_indexed: ["Not indexed", "bg-alert-light text-alert"],
  } as const;
  const [label, cls] = map[state];
  return <span className={`whitespace-nowrap rounded px-2 py-0.5 text-[11px] font-medium ${cls}`}>{label}</span>;
}

function ScoreBar({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(1, score)) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-20 rounded bg-gray-100">
        <div className="h-1.5 rounded bg-navy" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted">{score.toFixed(2)}</span>
    </div>
  );
}

function TestRetrieval() {
  const [query, setQuery] = useState(SAMPLE_QUERIES[0]);
  const [results, setResults] = useState<Citation[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      setResults((await api.searchPolicies(query, 5)).results);
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Test retrieval (what the research agent would find)">
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-line p-3 text-sm outline-none focus:ring-2 focus:ring-navy/30"
        placeholder="Paste or type a complaint…"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button onClick={run} disabled={busy || query.trim().length < 3}>
          {busy ? "Searching…" : "Search policies"}
        </Button>
        <span className="text-xs text-muted">Try:</span>
        {SAMPLE_QUERIES.slice(1).map((q) => (
          <button
            key={q}
            onClick={() => setQuery(q)}
            className="max-w-56 truncate rounded border border-line px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
            title={q}
          >
            {q}
          </button>
        ))}
      </div>
      {error && <div className="mt-3"><ErrorBox error={error} /></div>}
      {results && (
        <ol className="mt-4 space-y-3">
          {results.map((r, i) => (
            <li key={r.chunk_id} className="border-t border-line pt-3 text-sm first:border-0 first:pt-0">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">
                  {i + 1}. {r.title}
                </span>
                <ScoreBar score={r.score} />
              </div>
              <p className="mt-1 text-xs text-gray-600">{r.snippet}</p>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted">
        Scores are cosine similarity between the text and each policy section. The agent uses the top 3.
      </p>
    </Card>
  );
}

function Editor({
  initial,
  isNew,
  onSaved,
  onCancel,
}: {
  initial: { title: string; url: string | null; body: string; filename?: string };
  isNew: boolean;
  onSaved: (d: PolicyDetail) => void;
  onCancel: () => void;
}) {
  const { role } = useRole();
  const [title, setTitle] = useState(initial.title);
  const [url, setUrl] = useState(initial.url ?? "");
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    setBusy(true);
    try {
      const payload = { title, url: url || null, body, reviewer: role };
      const d = isNew ? await api.createPolicy(payload) : await api.savePolicy(initial.filename!, payload);
      onSaved(d);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <label className="block text-sm">
        <span className="text-xs text-muted">Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded-md border border-line px-3 py-2" />
      </label>
      <label className="block text-sm">
        <span className="text-xs text-muted">Source URL (official regulation or public policy page)</span>
        <input value={url} onChange={(e) => setUrl(e.target.value)} className="mt-1 w-full rounded-md border border-line px-3 py-2" placeholder="https://" />
      </label>
      <label className="block text-sm">
        <span className="text-xs text-muted">Text — each line starting with "## " starts a new searchable section</span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={18}
          className="mt-1 w-full rounded-md border border-line p-3 font-mono text-xs leading-relaxed outline-none focus:ring-2 focus:ring-navy/30"
        />
      </label>
      {error && <ErrorBox error={error} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} disabled={busy || title.length < 3 || body.length < 20}>
          {busy ? "Saving and re-indexing…" : isNew ? "Create and index" : "Save and re-index"}
        </Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <span className="text-xs text-muted">Saved as {role}. Changes are recorded in the Audit Log.</span>
      </div>
    </div>
  );
}

export default function KnowledgePage() {
  const { role } = useRole();
  const editor = can.editPolicies(role);
  const live = useLive(() => api.policies(), [], 30000);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<PolicyDetail | null>(null);
  const [mode, setMode] = useState<"view" | "edit" | "new">("view");
  const [reindexing, setReindexing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const docs = live.data?.documents ?? null;

  useEffect(() => {
    if (!selected && docs?.length) setSelected(docs[0].filename);
  }, [docs, selected]);

  useEffect(() => {
    if (!selected) return;
    setDetail(null);
    api.policy(selected).then(setDetail).catch(() => setDetail(null));
  }, [selected]);

  const reindex = async () => {
    setReindexing(true);
    try {
      const r = await api.reindex();
      setNotice(`Re-indexed ${r.indexed_chunks} sections.`);
      await live.refresh();
      if (selected) setDetail(await api.policy(selected));
    } catch (e) {
      setNotice(String(e));
    } finally {
      setReindexing(false);
    }
  };

  const onSaved = async (d: PolicyDetail) => {
    setMode("view");
    setSelected(d.filename);
    setDetail(d);
    setNotice(`Saved and indexed ${d.sections.length} sections of “${d.title}”.`);
    await live.refresh();
  };

  if (live.error && !docs) return <ErrorBox error={live.error} />;
  if (!docs) return <Loading />;
  const stale = docs.filter((d) => d.index_state !== "indexed").length;

  return (
    <>
      <PageHeader
        title="Knowledge Base"
        subtitle="Policy documents the Policy Research Agent searches (RAG). Summaries of public rules; not legal advice."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <RefreshControl updatedAt={live.updatedAt} loading={live.loading} onRefresh={live.refresh} />
            {editor && (
              <>
                <Button variant="secondary" onClick={reindex} disabled={reindexing}>
                  {reindexing ? "Re-indexing…" : "Rebuild index"}
                </Button>
                <Button onClick={() => { setMode("new"); setNotice(null); }}>New policy</Button>
              </>
            )}
          </div>
        }
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted">Documents</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums text-navy-dark">{docs.length}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted">Indexed sections</div>
          <div className="mt-1 text-3xl font-semibold tabular-nums text-navy-dark">{live.data?.indexed_chunks}</div>
        </Card>
        <Card>
          <div className="text-xs uppercase tracking-wide text-muted">Need re-indexing</div>
          <div className={`mt-1 text-3xl font-semibold tabular-nums ${stale ? "text-warn" : "text-ok"}`}>{stale}</div>
        </Card>
      </div>

      {notice && (
        <div className="mb-4 rounded-md border border-navy/20 bg-navy-light px-3 py-2 text-sm text-navy">{notice}</div>
      )}

      <div className="mb-4">
        <TestRetrieval />
      </div>

      <div className="grid gap-4 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <Card title="Documents">
            <ul className="divide-y divide-line">
              {docs.map((d) => (
                <li key={d.filename}>
                  <button
                    onClick={() => { setSelected(d.filename); setMode("view"); }}
                    className={`w-full rounded px-2 py-2.5 text-left hover:bg-gray-50 ${
                      selected === d.filename && mode !== "new" ? "bg-navy-light" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium">{d.title}</span>
                      <StateBadge state={d.index_state} />
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {d.sections} sections · cited in {d.cited} case{d.cited === 1 ? "" : "s"} · {d.filename}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="xl:col-span-3">
          {mode === "new" ? (
            <Card title="New policy">
              <Editor
                initial={{ title: "", url: "", body: NEW_TEMPLATE }}
                isNew
                onSaved={onSaved}
                onCancel={() => setMode("view")}
              />
            </Card>
          ) : !detail ? (
            <Card>
              <Loading />
            </Card>
          ) : mode === "edit" ? (
            <Card title={`Edit · ${detail.filename}`}>
              <Editor initial={detail} isNew={false} onSaved={onSaved} onCancel={() => setMode("view")} />
            </Card>
          ) : (
            <Card
              title={detail.filename}
              right={
                editor ? (
                  <Button variant="secondary" onClick={() => setMode("edit")}>
                    Edit
                  </Button>
                ) : (
                  <span className="text-xs text-muted">View only</span>
                )
              }
            >
              <h2 className="text-lg font-semibold text-navy-dark">{detail.title}</h2>
              {detail.url && (
                <a href={detail.url} target="_blank" rel="noreferrer" className="text-sm text-navy hover:underline break-all">
                  {detail.url}
                </a>
              )}
              <div className="mt-1">
                <StateBadge state={detail.index_state} />
              </div>
              <div className="mt-4 space-y-4">
                {detail.sections.map((s) => (
                  <section key={s.title} className="border-t border-line pt-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold">{s.title.split(": ").slice(1).join(": ") || s.title}</h3>
                      <span className="text-xs text-muted">cited in {s.cited} case{s.cited === 1 ? "" : "s"}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{s.text}</p>
                  </section>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
