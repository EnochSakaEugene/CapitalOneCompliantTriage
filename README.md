# TriageIQ: Agentic Complaint Triage for Capital One (case study)

GWU ISTM 6227 Generative AI for Business: team consulting project.

TriageIQ reads consumer complaints, classifies them, retrieves the relevant regulations
(RAG), routes high-risk cases to Compliance, and drafts replies for routine cases. A human
approves or escalates every case, and every step is written to an audit log.

> Student prototype. Not affiliated with or endorsed by Capital One. Uses only public
> CFPB Consumer Complaint Database records. Policy summaries are not legal advice.

## Architecture

```
Next.js (frontend/)  ──REST──►  FastAPI (backend/)
                                   │
                         LangGraph agent pipeline
    classify ─► research (RAG) ─► route ─┬─► draft ────► human review
                                         └─► escalate ─► compliance
                                   │
                 PostgreSQL + pgvector (complaints, triage, policy chunks, audit log)
```

| Agent | What it does | Course technique |
|---|---|---|
| Classify | Product, issue, sentiment, urgency, risk flags, summary (structured JSON) | Prompt engineering |
| Research | Retrieves top-3 regulation chunks by embedding similarity | RAG |
| Route | Tools: count similar complaints, compute 15-day deadline; decides draft vs. escalate | Agentic workflow |
| Draft | Writes a reply grounded in the retrieved policy text | Generative AI |
| Guardrails | PII redaction before LLM calls, human approval, audit log | Responsible AI |

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
| View every page (queue, cases, insights, evaluation, knowledge base, governance, audit log) | ✓ | ✓ | ✓ | ✓ |
| Download evaluation results and reports | ✓ | ✓ | ✓ | ✓ |
| Run AI triage on incoming complaints | ✓ | ✓ | – | ✓ |
| Edit and approve AI-drafted replies | ✓ | ✓ | – | ✓ |
| Escalate a case to Compliance | ✓ | ✓ | – | ✓ |
| Close escalated cases | – | ✓ | – | ✓ |
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
- [ ] Few-shot examples from the `train` split in the classifier prompt
- [ ] Fine-tuned small classifier, compared against few-shot on the Evaluation page
- [ ] RAG faithfulness scoring for drafts (LLM-as-judge plus human rating)
- [ ] Bias checks across states and tags (e.g. Servicemember, Older American)
- [x] Role-based authentication (4 roles, enforced in the API)
- [ ] Deploy: Vercel (frontend), Render or Railway (backend + Postgres)
