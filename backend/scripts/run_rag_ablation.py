"""RAG ablation: do retrieved policy excerpts reduce hallucination in draft replies?

For the same held-out complaints, draft a reply WITH the retrieved policy excerpts (the live
design) and WITHOUT them, then run the same hallucination check on both against the
excerpts and the complaint. Saves two evaluation runs ("draft-rag", "draft-norag") that the
Evaluation page compares.

  python -m scripts.run_rag_ablation --n 20 --seed 7 --rpm 8 --name "rag ablation 1"
  python -m scripts.run_rag_ablation --name "rag ablation 1"      # resume after a stop

About 5 LLM calls per complaint (classify, 2 drafts, 2 checks) + 1 embedding call.
"""
import argparse
import signal
import sys
import time
from datetime import datetime
from statistics import mean

from sqlalchemy import select

from app.agents.classifier import classify
from app.agents.graph import load_taxonomy, snap_to_taxonomy, write_draft
from app.agents.verify import check
from app.config import get_settings
from app.db import SessionLocal, init_db
from app.llm import model_name
from app.models import Complaint, EvalRun
from app.pii import redact
from app.rag.retriever import retrieve
from scripts.run_eval import DAILY_MARKERS, RATE_LIMIT_MARKERS, Budget, Pacer, StopBatch, sample_ids

settings = get_settings()
VARIANTS = ("draft-rag", "draft-norag")


def call(fn, pacer: Pacer, budget: Budget, llm: bool = True, tries: int = 6):
    for attempt in range(tries):
        if llm and not settings.mock_llm:
            budget.take()
            pacer.wait()
        try:
            return fn()
        except Exception as exc:  # noqa: BLE001
            msg = str(exc).lower()
            if any(m in msg for m in RATE_LIMIT_MARKERS):
                if any(m.replace(" ", "") in msg.replace(" ", "") for m in DAILY_MARKERS):
                    raise StopBatch("Daily quota used up; run the same command again tomorrow.") from exc
                if attempt < tries - 1:
                    pacer.slow_down()
                    time.sleep(min(60, 5 * 2 ** attempt))
                    continue
            raise


def summarize(cases: list[dict]) -> dict:
    ok = [c for c in cases if c.get("score") is not None]
    if not ok:
        return {"n": 0, "cases": cases}
    return {
        "n": len(ok),
        "grounded_mean": round(mean(c["score"] for c in ok), 3),
        "fully_grounded_rate": round(sum(c["score"] >= 0.999 for c in ok) / len(ok), 3),
        "unsupported_claims_mean": round(mean(len(c["unsupported"]) for c in ok), 2),
        "claims_mean": round(mean(c["claims"] for c in ok), 1),
        "latency_ms_mean": round(mean(c["ms"] for c in ok)),
        "output_tokens_mean": round(mean(c["tokens_out"] for c in ok)),
        "errors": len(cases) - len(ok),
        "cases": cases,
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--n", type=int, default=20)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--rpm", type=int, default=8)
    ap.add_argument("--max-calls", type=int, default=None)
    ap.add_argument("--name", default=None)
    args = ap.parse_args()
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(KeyboardInterrupt()))
    init_db()
    db = SessionLocal()
    taxonomy = load_taxonomy(db)
    name = args.name or datetime.now().strftime("rag ablation %Y-%m-%d %H:%M")

    runs = {v: db.scalars(select(EvalRun).where(EvalRun.name == name, EvalRun.variant == v)).first() for v in VARIANTS}
    if runs["draft-rag"]:
        ids = runs["draft-rag"].config["complaint_ids"]
        print(f'Resuming "{name}".', file=sys.stderr)
    else:
        ids = sample_ids(db, args.n, args.seed)
        for v in VARIANTS:
            runs[v] = EvalRun(name=name, variant=v, model=model_name(True), n_planned=len(ids),
                              config={"seed": args.seed, "n": len(ids), "complaint_ids": ids, "judge": model_name(),
                                      "prompt": "Draft with policy excerpts" if v == "draft-rag"
                                      else "Draft without excerpts (ablation)"},
                              metrics={"cases": []})
            db.add(runs[v])
        db.commit()
    cases = {v: list((runs[v].metrics or {}).get("cases", [])) for v in VARIANTS}
    done = {c["id"] for c in cases["draft-norag"]}
    for v in VARIANTS:
        runs[v].status = "running"
    db.commit()
    pacer, budget = Pacer(args.rpm), Budget(args.max_calls)
    complaints = {c.id: c for c in db.scalars(select(Complaint).where(Complaint.id.in_(ids))).all()}
    print(f"{len(ids) - len(done)} complaints to go (~{5 * (len(ids) - len(done))} LLM calls).", file=sys.stderr)
    try:
        for cid in ids:
            if cid in done:
                continue
            text, _ = redact(complaints[cid].narrative)
            out = call(lambda: classify("rules" if settings.mock_llm else settings.classifier_prompt_version,
                                        text, taxonomy), pacer, budget)
            cls, _ = snap_to_taxonomy(out["result"], taxonomy)
            citations = retrieve(db, f"{cls['product']} {cls['issue']}\n{cls['summary']}")
            for v in VARIANTS:
                t0 = time.perf_counter()
                reply, usage = call(lambda: write_draft(cls, citations, text, use_rag=(v == "draft-rag")), pacer, budget)
                ms = round((time.perf_counter() - t0) * 1000)
                g = call(lambda: check(reply, citations, text), pacer, budget)
                cases[v].append({"id": cid, "score": g["score"], "claims": len(g["claims"]),
                                 "unsupported": g["unsupported"][:4], "ms": ms,
                                 "tokens_out": usage["output_tokens"], "reply": reply[:1200]})
            for v in VARIANTS:
                runs[v].metrics = {**summarize(cases[v]), "cases": cases[v]}
                runs[v].n_done = len(cases[v])
            db.commit()
            print(f"  {len(cases['draft-norag'])}/{len(ids)}  rag={cases['draft-rag'][-1]['score']}  "
                  f"no-rag={cases['draft-norag'][-1]['score']}", file=sys.stderr)
        for v in VARIANTS:
            runs[v].status, runs[v].finished_at = "done", datetime.now()
        db.commit()
    except (StopBatch, KeyboardInterrupt) as exc:
        db.rollback()
        for v in VARIANTS:
            runs[v].status = "stopped"
        db.commit()
        print(f'\nStopped: {exc}\nResume with: python -m scripts.run_rag_ablation --name "{name}"', file=sys.stderr)
        sys.exit(2)
    for v in VARIANTS:
        m = runs[v].metrics
        print(f"{v}: grounded {m.get('grounded_mean')}  fully grounded {m.get('fully_grounded_rate')}  "
              f"unsupported/draft {m.get('unsupported_claims_mean')}")


if __name__ == "__main__":
    main()
