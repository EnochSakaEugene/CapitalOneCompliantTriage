# TriageIQ: Agentic Complaint Triage for Capital One (case study)

GWU ISTM 6227 Generative AI for Business: team consulting project.

TriageIQ reads consumer complaints, screens them for prompt injection, classifies them,
retrieves the relevant regulations (RAG), routes high-risk cases to Compliance, drafts replies
for routine cases (in English or Spanish) and checks each draft for hallucinated claims. A human
approves or escalates every case, and every step is written to an audit log.

> Student prototype. Not affiliated with or endorsed by Capital One. Uses only public
> CFPB Consumer Complaint Database records. Policy summaries are not legal advice.

## Architecture

```
Next.js (frontend/)  ──REST + SSE──►  FastAPI (backend/)
                                         │
                               LangGraph agent pipeline
  screen ─► classify ─► research (RAG) ─► route ─┬─► draft ─► verify ─► human review
                                                 └─► escalate ─────────► compliance
                                         │
     PostgreSQL + pgvector (complaints + embeddings, triage, policy chunks, eval runs, audit log)
```

| Agent | What it does | Course technique |
|---|---|---|
| Screen | Prompt-injection screen (rules, before any LLM call); language detection; translation to English | Security, responsible AI |
| Classify | Product, issue, sentiment, urgency, risk flags, summary (structured JSON); uses promoted analyst corrections | Prompt engineering |
| Research | Retrieves top-3 regulation chunks by embedding similarity | RAG |
| Route | Tools: count similar complaints, compute 15-day deadline; decides draft vs. escalate | Agentic workflow |
| Draft | Reply grounded in the retrieved policy text, in the customer's language | Generative AI |
| Verify | Independent LLM-judge check of every claim in the draft against the excerpts | Evaluation, hallucination control |
| Guardrails | PII redaction, human approval, role-based access, audit log | Responsible AI |

### Pages

| Group | Page | What it shows |
|---|---|---|
| Work | Triage Queue, case detail | Prioritised queue; case with AI output, citations, hallucination check, similar past cases, label correction |
| Work | New Complaint | Submit a complaint and watch each agent finish live (Server-Sent Events) |
| Work | Escalations, Deadlines | Compliance queue; 15-day response clock with "time travel" demo and daily summary |
| Analyze | Insights | Volumes, risk mix, emerging-issue alerts with AI theme summaries |
| Analyze | Evaluation | Prompt-version experiments, model-adaptation comparison, RAG ablation |
| Analyze | Monitoring | Groundedness, override rate, drift (PSI), latency, cost, corrections to promote |
| Analyze | Business Case | Problem, measured evidence, ROI calculator, automate vs. not, roadmap, recommendation |
| Govern | Governance, Knowledge Base, Weekly Report, Audit Log | Oversight, fairness, red team, risk register; RAG corpus; printable report; full audit trail |

**Mock mode:** with no `OPENAI_API_KEY`, keyword rules replace the LLM so the whole system
runs offline at no cost. The Evaluation page then shows a rules baseline to compare the LLM
against.

## Quick start (Docker)

```bash
cp .env.example .env            # add your OpenAI key, or leave empty for mock mode
docker compose up --build -d    # starts db, backend (8000) and frontend (3000)

# Load data (run once). Option A downloads CFPB narrative archive files (Jan-Jul 2026):
docker compose exec backend python -m scripts.load_cfpb --download --limit 8000
# Option B uses archive .zip files you downloaded into ./data:
docker compose exec backend python -m scripts.load_cfpb --csv /data/CCDB_Export_20_July_2026.zip --limit 8000

docker compose exec backend python -m scripts.ingest_policies

# Optional (needs a Gemini key): embed complaints for semantic similar-case search and the
# embedding classifier. Resumable; run again after a quota stop.
docker compose exec backend python -m scripts.embed_complaints
```

Open http://localhost:3000 and click **Triage next 10 incoming**. API docs: http://localhost:8000/docs

## Logging in (role-based access)

Menus and data are only visible after login. Users are stored in the `users` table with salted
PBKDF2 password hashes; sessions are signed tokens that expire after 8 hours and are invalidated
when the password changes. Five failed attempts lock an account for 15 minutes. Every login,
logout and password change is recorded in the audit log, and approvals/escalations are recorded
under the logged-in user (the client can no longer choose the reviewer name).

Every signed-in role sees every menu and page (shared visibility); roles differ in what they
can **do**, and the back end enforces this on every request. The landing page shows the same matrix.

| Capability | Analyst | Compliance | CX Leader | Admin |
|---|:-:|:-:|:-:|:-:|
| View every page (work queues, analytics, governance, reports, audit log) | ✓ | ✓ | ✓ | ✓ |
| Download evaluation results and print the weekly compliance report | ✓ | ✓ | ✓ | ✓ |
| Submit a new complaint and run AI triage | ✓ | ✓ | – | ✓ |
| Edit and approve AI-drafted replies (with a hallucination re-check) | ✓ | ✓ | – | ✓ |
| Correct the AI's product or issue label | ✓ | ✓ | – | ✓ |
| Escalate a case to Compliance | ✓ | ✓ | – | ✓ |
| Close escalated cases | – | ✓ | – | ✓ |
| Promote analyst corrections into the AI's examples | – | ✓ | – | ✓ |
| Edit the regulation knowledge base and re-index it | – | ✓ | – | ✓ |
| Add and update risks in the risk register | – | ✓ | – | ✓ |
| Change own password | ✓ | ✓ | ✓ | ✓ |

Demo accounts are created automatically on first start (DEMO ONLY: change passwords after login):

| Role | Email | Password |
|---|---|---|
| Complaint Analyst | analyst@triageiq.demo | Analyst#2026 |
| Compliance Officer | compliance@triageiq.demo | Comply#2026 |
| CX Leader | cx@triageiq.demo | Insight#2026 |
| Administrator | admin@triageiq.demo | Admin#Triage26 |

Reset demo passwords: `docker compose exec backend python -m scripts.seed_users --reset`.
Set `AUTH_SECRET` in `.env` to a long random value (e.g. `openssl rand -hex 32`).

## Experiments for the report

```bash
# Prompt versions + trained classifiers on the same held-out sample (component 6)
docker compose exec backend python -m scripts.run_eval --variants rules,tfidf,embed,v2,v4 --n 100 --seed 2026 --rpm 8 --name "batch 3"
# RAG ablation: hallucination with vs without retrieved policy excerpts (components 4 and 7)
docker compose exec backend python -m scripts.run_rag_ablation --n 20 --seed 7 --rpm 8 --name "rag ablation 1"
```

Both are resumable (`--resume "batch 3"` for run_eval; the same `--name` for the ablation). Results
appear on the Evaluation page. `embed` is skipped until `scripts.embed_complaints` has run.

## Running without Docker

```bash
# Postgres 16 with the pgvector extension must be running locally
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
export DATABASE_URL=postgresql+psycopg://triage:triage@localhost:5432/triage
python -m scripts.load_cfpb --download --limit 8000
python -m scripts.ingest_policies
uvicorn app.main:app --reload --port 8000

cd ../frontend && npm install && npm run dev   # http://localhost:3000
```

## Tests

```bash
cd backend
DATABASE_URL=postgresql+psycopg://triage:triage@localhost:5432/triage_test pytest -q
```

Tests use `backend/tests/fixtures/synthetic_complaints.csv`, a set of **synthetic**
records, never real CFPB data.

## Data notes

- **Narratives come from the CFPB archive, not the live API.** On August 14, 2026 the CFPB
  stopped publishing complaint narratives; the live search API and CSV export no longer
  include them. Narratives published from Dec 2011 to Aug 14, 2026 are in the
  [Consumer Complaint Database Narratives Archive](https://www.consumerfinance.gov/foia-requests/foia-electronic-reading-room/cfpb-consumer-complaint-database-narratives-archive/)
  (zip files by month or date range). Pass more files with repeated `--archive-url` or `--csv`.

- Only complaints whose company contains "CAPITAL ONE" and that have a consumer narrative
  are loaded. 20% are marked `test`: they act as the incoming queue and the held-out
  evaluation set. The CFPB's product and issue labels are hidden from the agents and used
  only for scoring.
- CFPB complaint dates are historical, so the 15-day response clock starts when a complaint
  is triaged in TriageIQ, simulating live intake.

## Project layout

```
backend/
  app/agents/       graph.py (LangGraph pipeline), schemas.py, mock_rules.py
  app/rag/          retriever.py, policies/*.md (RAG corpus)
  app/routers/      api.py (REST endpoints)
  app/models.py     complaints, triage, policy_chunks, audit_events
  app/pii.py        redaction before LLM calls
  scripts/          load_cfpb.py, ingest_policies.py
  tests/            end-to-end pipeline tests
frontend/
  app/queue, cases/[id], escalations, insights, evaluation, audit
  components/, lib/api.ts
```

## Roadmap

- [ ] Verify policy summaries and URLs; add summaries of Capital One's public policy pages
- [x] Few-shot examples from the `train` split (prompt v3) and promoted analyst corrections
- [x] Trained classifiers (TF-IDF and embedding + logistic regression) compared on the Evaluation page
- [x] Hallucination check on every draft (LLM judge) and a RAG ablation
- [ ] Human rating of a sample of drafts to validate the LLM judge
- [ ] Bias checks across states and tags (e.g. Servicemember, Older American)
- [x] Role-based authentication (4 roles, enforced in the API)
- [ ] Deploy: Vercel (frontend), Render or Railway (backend + Postgres)
