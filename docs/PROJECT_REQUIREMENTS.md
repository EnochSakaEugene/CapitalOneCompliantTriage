# TriageIQ: Project Requirements Tracker

Source: `ISTM_6227_GenAI_Group_Project_Instructions_Fall_2026.pdf` (in this folder).
Lifecycle: **DEFINE → DESIGN → BUILD → DEMONSTRATE → EVALUATE → GOVERN → RECOMMEND**

Key dates: Project Update / prototype check (week 10, Oct 27) · **Final presentation Dec 8, 2026** (10 min + ~3 min Q&A) · **Final report Dec 15, 2026** (10–15 pages + appendices, revised with presentation feedback).

Status key: ✅ built in the system · 🟡 built, needs real results or write-up · ⬜ not started

## The nine required components

| # | Requirement (from instructions) | TriageIQ evidence | Status | Still needed (mostly results and writing) |
|---|---|---|---|---|
| 1 | **Business problem & value**: organization, users, stakeholders, why GenAI instead of a non-GenAI approach, measurable success indicators | Business Case page: problem, why GenAI + agents, who benefits, success indicators with targets; keyword rules and TF-IDF classifier as non-GenAI baselines; roles page | 🟡 | Validate time-per-complaint assumptions (interview or literature); cite the CFPB volume figure |
| 2 | **Solution & architecture**: what it does, how users interact, workflow, models, data/knowledge sources, design choices | 12 pages in 3 groups; Next.js + FastAPI + LangGraph + Postgres/pgvector; Gemini models; README architecture | 🟡 | Architecture diagram and design-choice rationale for the report |
| 3 | **Prompt engineering**: baseline → improved evolution, system/role prompts, zero/few-shot, structured output, enrichment, samples | Prompt versions v1–v4 in `prompts.py` with history; structured output; taxonomy enrichment; few-shot (v3); analyst-correction examples; batch 1 results | 🟡 | Finish batch 2 (v2 vs v4); export sample prompts/outputs for the appendix |
| 4 | **Knowledge, embeddings & RAG**: knowledge base, representation, retrieval, effect on grounding/hallucination | 12 policy docs in pgvector; Knowledge Base page; citations on every case; **RAG ablation** script and Evaluation panel | 🟡 | Run `scripts.run_rag_ablation` with Gemini; verify policy summaries against sources |
| 5 | **Agentic workflow**: multi-step, tools, human escalation, where oversight remains | screen → classify → research → route (tools) → draft → verify / escalate; live step-by-step view on New Complaint; human approve/edit/escalate/close | ✅ | Workflow diagram for the report |
| 6 | **Model adaptation**: prompting vs RAG vs fine-tuning (accuracy, cost, privacy, scalability, maintenance) | `tfidf` and `embed` trained classifiers in the eval runner; comparison table (incl. why no full fine-tuning) on the Evaluation page | 🟡 | Run `scripts.embed_complaints` then `run_eval --variants rules,tfidf,embed,v2,v4` on one batch |
| 7 | **Evaluation & GenAI ops**: test set; accuracy, hallucination, consistency, latency, cost; baseline vs final table; monitoring | Eval runner (accuracy, macro-F1, top-2, consistency, latency, tokens, cost); hallucination check on every draft; Monitoring page (groundedness, override rate, PSI drift, latency, cost, alerts); weekly report | 🟡 | Set PRICE_* in .env; final baseline-vs-final table; small human rating of drafts to validate the judge |
| 8 | **Governance & responsible AI**: hallucination, bias, privacy, security, copyright/IP, prompt injection, misuse, oversight; automate vs not | Governance page: oversight, model card, fairness, **red-team results**, risk register (now 14 risks incl. copyright/IP, misuse, language fairness); PII redaction; injection screen; audit log; role-based access; automate-vs-not table | ✅ | Assign real owners; quote red-team numbers in the report |
| 9 | **Roadmap & recommendation**: org requirements, benefits, costs, scalability, deploy or not | Business Case page: ROI calculator with scenarios, 4-phase roadmap, go/no-go indicators, recommendation (controlled pilot) | 🟡 | Final numbers from live runs; written recommendation in the report |

## Final deliverables checklist

- [x] **Working prototype / functional demo** (record a backup demo video before Dec 8)
- [ ] **Project Update (Oct 27)**: prompt design, prototype, RAG approach, agentic workflow, evaluation plan, challenges, next steps
- [ ] **Final consulting report**, 10–15 pages: Executive Summary · 1 Business Problem & Opportunity · 2 Proposed Solution & Business Value · 3 Architecture & Technical Design · 4 Prompt Engineering & Interaction Design · 5 RAG/Knowledge & Agentic Workflow · 6 Prototype & Demonstration · 7 Evaluation & Results · 8 Governance, Risk & Responsible AI · 9 Implementation Roadmap & Final Recommendation · References · Appendix
- [ ] **Appendix / technical artifacts**: prompts, sample outputs, evaluation test cases, red-team set, architecture diagrams, RAG materials, system instructions
- [ ] **Final presentation** (Dec 8): problem, solution, demo, evaluation results, governance, recommendation
- [ ] **Revised report** incorporating presentation feedback (Dec 15)
- [ ] **Documentation of AI use**: prompts, tools, models, data/knowledge sources and AI-generated materials (including AI help writing the code)

## Runs to do with the Gemini key (they produce the report's numbers)

1. `python -m scripts.run_eval --resume "batch 2: v2 vs v4 (seed 2026)"`
2. `python -m scripts.embed_complaints` (once; resumable)
3. `python -m scripts.run_eval --variants rules,tfidf,embed,v2,v4 --n 100 --seed 2026 --rpm 8 --name "batch 3: adaptation"`
4. `python -m scripts.run_rag_ablation --n 20 --seed 7 --rpm 8 --name "rag ablation 1"`
5. Triage 30–50 queue complaints and approve/correct a sample so Monitoring and the Business Case show live numbers

## Grading criteria (what the instructor looks for)

| Criterion | Where TriageIQ shows it |
|---|---|
| Business problem & value | Business Case page; Insights (emerging issues); proposal |
| Integration of course concepts | Prompting, RAG, agents, model adaptation, ops, governance: components 3–8 |
| Prototype & technical execution | 12 pages, live agent streaming, 35 automated tests |
| Evaluation & critical analysis | Evaluation (experiments, adaptation, RAG ablation), Monitoring, model-card limitations |
| Governance & responsible AI | Governance (red team, fairness, risk register), Audit Log, human-in-the-loop, roles |
| Implementation & recommendation | Business Case roadmap, success indicators, recommendation |
| Professional communication | Report, slides, demo quality, weekly report |

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

### Red-team set (Oct 18, 2026): rule-based injection screen
- 17 of 18 attacks caught (94%); 0 of 8 tricky benign complaints flagged. Expected miss: A17, a polite paraphrase with no trigger words (contained by schema outputs + human approval). Real-complaint false-positive rate: see Governance page after loading data.
