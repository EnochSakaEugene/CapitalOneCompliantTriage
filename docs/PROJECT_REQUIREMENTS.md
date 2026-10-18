# TriageIQ: Project Requirements Tracker

Source: `ISTM_6227_GenAI_Group_Project_Instructions_Fall_2026.pdf` (in this folder).
Lifecycle: **DEFINE → DESIGN → BUILD → DEMONSTRATE → EVALUATE → GOVERN → RECOMMEND**

Key dates: Project Update / prototype check (week 10, Oct 27) · **Final presentation Dec 8, 2026** (10 min + ~3 min Q&A) · **Final report Dec 15, 2026** (10–15 pages + appendices, revised with presentation feedback).

Status key: ✅ done · 🟡 partial · ⬜ not started

## The nine required components

| # | Requirement (from instructions) | TriageIQ evidence so far | Status | What's still needed |
|---|---|---|---|---|
| 1 | **Business problem & value**: organization, users, stakeholders, why GenAI instead of a non-GenAI approach, measurable success indicators | One-page proposal (Capital One case company, CFPB complaint triage); 3 user roles; targets (40–60% time saved, ≥85% product accuracy, ≥90% high-risk recall) | 🟡 | Written "why GenAI vs. rules/classic ML" argument (the mock keyword rules are a ready-made non-GenAI baseline); stakeholder list |
| 2 | **Solution & architecture**: what it does, how users interact, workflow, models, data/knowledge sources, design choices | Next.js + FastAPI + LangGraph + Postgres/pgvector; Gemini (3.5 Flash-Lite / 3.8 Flash / embedding-001); README architecture sketch | 🟡 | Proper architecture diagram for the report; design-choice rationale write-up |
| 3 | **Prompt engineering**: baseline → improved prompt evolution, system/role prompts, zero/few-shot, structured output, prompt enrichment, sample prompts/outputs | System prompts in `backend/app/agents/graph.py`; structured JSON output (Pydantic); v1 → v2 change: free-text issue labels → CFPB taxonomy injected into the prompt (issue match went from ~0% to measurable) | 🟡 | Save prompt versions (v1/v2/v3) in `docs/prompts/`; add **few-shot** examples from the train split; measure each version on the same test set |
| 4 | **Knowledge, embeddings & RAG**: is external knowledge needed; build a knowledge base; how docs are represented, retrieved and supplied; effect on grounding/hallucination | 12 policy docs (41 sections) chunked on `##` headings, embedded into pgvector, top-3 cosine retrieval; Knowledge Base page with live retrieval test, edit and re-index | 🟡 | Verify policy summaries against sources; measure grounding (draft faithfulness to cited policy); with-RAG vs without-RAG draft comparison |
| 5 | **Agentic workflow**: multi-step (classification, retrieval, generation, extraction, tool use, human escalation); where human oversight remains | LangGraph: classify → research (RAG) → route (tools: similar-case count, deadline) → draft or escalate; human approve/edit/escalate/close; agent trace + audit log | ✅ | Workflow diagram for the report |
| 6 | **Model adaptation**: compare prompting vs RAG vs fine-tuning (accuracy, cost, privacy, scalability, maintenance); justify; fine-tuning optional but understood | Prompting + RAG implemented; mock rules give a non-GenAI baseline | ⬜ | Comparison table: rules vs zero-shot vs few-shot (vs optional small fine-tuned classifier); written justification |
| 7 | **Evaluation & GenAI ops**: systematic test set; accuracy, relevance, hallucination, consistency, response quality, latency, cost, UX; baseline vs final table; post-deployment monitoring | Evaluation page (product/issue accuracy vs CFPB labels, confusion pairs); per-step latency in agent trace; held-out `test` split | 🟡 | Bulk evaluation runner on the test split; add latency, token cost, consistency (repeat runs), draft quality / hallucination rubric; results table; monitoring plan |
| 8 | **Governance & responsible AI**: hallucination, bias/fairness, privacy, data security, **copyright/IP**, prompt injection, misuse, human oversight; safeguards; what to automate and what not | Governance page: oversight metrics, model card, fairness by tag/state, editable risk register (9 risks, live indicators); PII redaction; audit log | 🟡 | Add **copyright/IP** and **misuse** risks to the register; explicit "automate vs. do not automate" table; assign real owners |
| 9 | **Implementation roadmap & recommendation**: org requirements, benefits, costs/constraints, scalability, deploy or not and how | Not started | ⬜ | Phased roadmap (pilot → scale), ROI estimate, cost model, staffing/integration needs, final recommendation |

## Final deliverables checklist

- [ ] **Working prototype / functional demo** (the app; plan a backup demo video)
- [ ] **Final consulting report**, 10–15 pages, following the suggested structure:
  Executive Summary · 1 Business Problem & Opportunity · 2 Proposed Solution & Business Value · 3 Architecture & Technical Design · 4 Prompt Engineering & Interaction Design · 5 RAG/Knowledge & Agentic Workflow · 6 Prototype & Demonstration · 7 Evaluation & Results · 8 Governance, Risk & Responsible AI · 9 Implementation Roadmap & Final Recommendation · References · Appendix
- [ ] **Appendix / technical artifacts**: prompts, sample outputs, evaluation test cases, architecture diagrams, RAG materials, system instructions
- [ ] **Final presentation** (Dec 8): problem, solution, demo, evaluation results, governance, recommendation
- [ ] **Revised report** incorporating presentation feedback (Dec 15)
- [ ] **Documentation of AI use**: prompts, tools, models, data/knowledge sources and AI-generated materials used in the project (required by the instructions and the syllabus GenAI policy)

## Grading criteria (what the instructor looks for)

| Criterion | Where TriageIQ shows it |
|---|---|
| Business problem & value | Proposal; Insights page; ROI estimate (to do) |
| Integration of course concepts | Prompting, RAG, agents, model adaptation, ops, governance: components 3–8 above |
| Prototype & technical execution | The running app (7 pages + case detail) |
| Evaluation & critical analysis | Evaluation page + results tables (to do) + limitations on the model card |
| Governance & responsible AI | Governance page, Audit Log, human-in-the-loop design |
| Implementation & recommendation | Roadmap + recommendation (to do) |
| Professional communication | Report, slides, demo quality |

## Notes from the instructions to keep in mind

- Focus on the specific business problem, not GenAI in general.
- A more complex system is not automatically better; every design choice needs reasoning and evidence.
- The team is responsible for checking all AI-generated content (including code and the policy summaries).

## Results log

### Evaluation batch 1 (Oct 18, 2026): 100 held-out complaints, same sample for all variants, gemini-3.5-flash-lite

| Variant | Product acc. | Macro-F1 | Issue acc. | Valid labels | Consistency | p95 latency | Tokens/case |
|---|---|---|---|---|---|---|---|
| Keyword rules (non-GenAI) | 64.0% | 0.285 | 29.0% | 100% | — | 1 ms | 0 |
| v1 zero-shot, free-text issue | 79.0% | 0.743 | 30.0% | 52.0% | 70% | 1,289 ms | 681 |
| **v2 zero-shot + CFPB taxonomy** | **83.0%** | 0.725 | 46.0% | 100% | 80% | 1,269 ms | 1,333 |
| v3 few-shot + taxonomy | 78.0% | 0.674 | 48.0% | 100% | 60% | 1,436 ms | 2,259 |

Decisions and notes:
- **v2 kept as the live prompt.** Best product accuracy, 100% valid labels, half the tokens of v3.
- **v3 (few-shot) rejected:** lower product accuracy and consistency for ~70% more tokens (evidence for component 6).
- GenAI vs. rules: macro-F1 0.285 → ~0.73. The rules only handle the dominant credit-card class (evidence for component 1, "why GenAI").
- Caveats: n = 100 gives roughly ±7 points at 83%; consistency measured on 10 complaints × 3 runs; CFPB product/issue labels are chosen by consumers, so exact-match issue accuracy understates quality.
- Error analysis of v2: debt collection on a Capital One card debt labelled "Credit card"; most other misses are neighbouring issues within the right product. This led to **prompt v4** (disambiguation rules + second-choice issue for top-2 accuracy). Next: run v2 vs v4 on a new batch.
