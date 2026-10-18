"""Evaluation runner: score classifier variants on the SAME held-out complaints.

Variants
  rules  non-GenAI keyword baseline (free, instant)
  v1     zero-shot, free-text issue label (original prompt)
  v2     zero-shot + CFPB taxonomy (current default)
  v3     few-shot (1 train example per product) + CFPB taxonomy
  v4     v2 + disambiguation rules + second-choice issue (top-2 issue accuracy)
  tfidf  TF-IDF + logistic regression trained on the train split (model adaptation, local)
  embed  Gemini embeddings + logistic regression (needs scripts.embed_complaints first)

Start a batch (from backend/, or `docker compose exec backend ...`):
  python -m scripts.run_eval --variants rules,v2,v4 --n 100 --seed 2026 --rpm 8 --name "batch 2"

Resume a batch that was stopped (Ctrl+C, quota, restart). Calls that already worked are kept:
  python -m scripts.run_eval --resume "batch 2"

Options
  --n            number of test-split complaints (same sample for every variant)
  --seed         which random sample of test complaints to use
  --rpm          starting max LLM calls per minute; lowered automatically when Gemini rate-limits
  --consistency  re-run the first K complaints 2 more times per LLM variant (consistency check)
  --max-calls    stop (resumably) after this many LLM calls, to stay inside a daily free quota
  --name         label for this batch (default: date-time)

If Gemini reports that the DAILY quota is used up, the batch stops cleanly and can be resumed
the next day with --resume. Results appear on the Evaluation page; the live queue is untouched.
"""
import argparse
import random
import signal
import sys
import time
import warnings
from datetime import datetime

from sqlalchemy import delete, func, select

from app.agents.classifier import classify
from app.agents.graph import _closest, load_taxonomy, snap_to_taxonomy
from app.adaptation import TRAINED_VARIANTS, TrainedClassifier
from app.agents.prompts import PROMPT_VERSIONS, few_shot_examples
from app.config import get_settings
from app.db import SessionLocal, init_db
from app.evaluation import compute_metrics
from app.llm import model_name
from app.models import Complaint, EvalCase, EvalRun, FewShotExample
from app.pii import redact

# gemini-3.5-flash-lite ignores temperature and warns on every call; the fact is noted in the report.
warnings.filterwarnings("ignore", message=".*uses fixed sampling defaults.*")

settings = get_settings()
RATE_LIMIT_MARKERS = ("429", "rate", "quota", "resource_exhausted", "resource exhausted")
DAILY_MARKERS = ("perday", "per day", "per_day", "daily")


class StopBatch(Exception):
    """Stop the whole batch cleanly (daily quota, --max-calls, Ctrl+C); it can be resumed."""


class Pacer:
    """Keeps LLM calls under a requests-per-minute limit and slows down after rate limits."""

    def __init__(self, rpm: int):
        self.interval = 60.0 / rpm if rpm > 0 else 0.0
        self.last = 0.0

    def wait(self) -> None:
        if self.interval:
            delay = self.last + self.interval - time.monotonic()
            if delay > 0:
                time.sleep(delay)
        self.last = time.monotonic()

    def slow_down(self) -> None:
        self.interval = min(30.0, max(self.interval, 5.0) * 1.5)
        print(f"    slowing down to ~{60 / self.interval:.1f} calls/min", file=sys.stderr)


class Budget:
    def __init__(self, max_calls: int | None):
        self.max_calls = max_calls
        self.used = 0

    def take(self) -> None:
        if self.max_calls is not None and self.used >= self.max_calls:
            raise StopBatch(f"reached --max-calls {self.max_calls}")
        self.used += 1


def sample_ids(db, n: int, seed: int) -> list[int]:
    # Analyst-corrected cases promoted into prompts are excluded so evaluation never leaks.
    promoted = select(FewShotExample.complaint_id)
    ids = db.scalars(
        select(Complaint.id).where(Complaint.split == "test", Complaint.product.is_not(None),
                                   Complaint.issue.is_not(None), Complaint.id.not_in(promoted))
        .order_by(Complaint.id)
    ).all()
    rnd = random.Random(seed)
    return rnd.sample(list(ids), min(n, len(ids)))


def classify_with_retry(variant, narrative, taxonomy, examples, pacer, budget, uses_llm, tries=6):
    for attempt in range(tries):
        if uses_llm:
            budget.take()
            pacer.wait()
        try:
            return classify(variant, narrative, taxonomy, examples), None
        except Exception as exc:  # noqa: BLE001
            msg = str(exc)
            low = msg.lower().replace(" ", "")
            if uses_llm and any(m in msg.lower() for m in RATE_LIMIT_MARKERS):
                if any(m.replace(" ", "") in low for m in DAILY_MARKERS):
                    raise StopBatch("Gemini daily quota used up. Resume tomorrow with --resume, "
                                    "or enable billing for higher limits.") from exc
                if attempt < tries - 1:
                    pacer.slow_down()
                    wait = min(60, 5 * 2 ** attempt)
                    print(f"    rate limited, waiting {wait}s ...", file=sys.stderr)
                    time.sleep(wait)
                    continue
            return None, msg[:500]
    return None, "gave up after retries"


def plan_for(ids: list[int], uses_llm: bool, consistency: int) -> list[tuple[int, int]]:
    plan = [(cid, 0) for cid in ids]
    if uses_llm and consistency:
        plan += [(cid, r) for cid in ids[:consistency] for r in (1, 2)]
    return plan


def model_label(variant: str) -> str:
    if variant == "rules":
        return "keyword-rules"
    if variant == "tfidf":
        return "tfidf+logreg (local)"
    if variant == "embed":
        return f"{settings.gemini_embedding_model if settings.provider == 'gemini' else settings.embedding_model}+logreg"
    return model_name()


def get_or_create_run(db, variant, ids, name, seed, rpm, consistency, examples, resume) -> EvalRun:
    uses_llm = variant in PROMPT_VERSIONS
    if resume:
        run = db.scalars(select(EvalRun).where(EvalRun.name == name, EvalRun.variant == variant)
                         .order_by(EvalRun.id.desc())).first()
        if run:
            return run
    run = EvalRun(
        name=name, variant=variant, model=model_label(variant),
        n_planned=len(plan_for(ids, uses_llm, consistency)),
        config={"seed": seed, "n": len(ids), "rpm": rpm, "consistency": consistency if uses_llm else 0,
                "prompt": PROMPT_VERSIONS.get(variant) or TRAINED_VARIANTS.get(variant) or "Keyword rules baseline",
                "few_shot_examples": len(examples or []), "complaint_ids": ids},
    )
    db.add(run)
    db.commit()
    return run


def run_variant(db, variant, ids, taxonomy, name, seed, rpm, consistency, pacer=None, budget=None, resume=False):
    uses_llm = variant in PROMPT_VERSIONS
    if uses_llm and settings.mock_llm:
        print(f"Skipping {variant}: no Gemini/OpenAI key is set (mock mode).", file=sys.stderr)
        return None
    trained = None
    if variant in TRAINED_VARIANTS:
        try:
            trained = TrainedClassifier(variant).fit(db)
        except RuntimeError as exc:
            print(f"Skipping {variant}: {exc}", file=sys.stderr)
            return None
        print(f"  trained {variant} on {trained.info['n_train']} train complaints in "
              f"{trained.info['fit_seconds']}s", file=sys.stderr)
    pacer = pacer or Pacer(rpm)
    budget = budget or Budget(None)
    examples = few_shot_examples(db, taxonomy) if variant == "v3" else None
    run = get_or_create_run(db, variant, ids, name, seed, rpm, consistency, examples, resume)
    if trained:
        run.config = {**(run.config or {}), "training": trained.info}
    if run.status == "done":
        print(f"\n[{variant}] run #{run.id} already finished, skipping.", file=sys.stderr)
        return run
    consistency = (run.config or {}).get("consistency", consistency)
    plan = plan_for(ids, uses_llm, consistency)
    # Resume: drop failed calls so they are retried; keep calls that worked.
    db.execute(delete(EvalCase).where(EvalCase.run_id == run.id, EvalCase.error.is_not(None)))
    done = set(db.execute(select(EvalCase.complaint_id, EvalCase.repeat).where(EvalCase.run_id == run.id)).all())
    todo = [p for p in plan if p not in done]
    run.status, run.n_planned, run.n_done, run.finished_at = "running", len(plan), len(done), None
    db.commit()
    complaints = {c.id: c for c in db.scalars(select(Complaint).where(Complaint.id.in_(ids))).all()}
    print(f"\n[{variant}] {PROMPT_VERSIONS.get(variant, 'rules')}  ->  run #{run.id}: "
          f"{len(done)} done, {len(todo)} to go", file=sys.stderr)
    try:
        for cid, rep in todo:
            c = complaints[cid]
            narrative, _ = redact(c.narrative)
            if trained:
                try:
                    out, err = trained.predict(c, narrative, taxonomy), None
                except RuntimeError as exc:
                    out, err = None, str(exc)
            else:
                out, err = classify_with_retry(variant, narrative, taxonomy, examples, pacer, budget, uses_llm)
            case = EvalCase(run_id=run.id, complaint_id=cid, repeat=rep, true_product=c.product, true_issue=c.issue)
            if err:
                case.error = err
            else:
                snapped, _ = snap_to_taxonomy(out["result"], taxonomy)
                case.pred_product, case.pred_issue = snapped["product"], snapped["issue"]
                case.raw_issue = out["result"]["issue"][:300]
                if out["result"].get("issue_alt"):
                    issues = taxonomy.get(case.pred_product, [])
                    alt = out["result"]["issue_alt"]
                    case.alt_issue = (alt if alt in issues else _closest(alt, issues))[:300] if issues else alt[:300]
                case.in_taxonomy = out["in_taxonomy"]
                case.risk_level, case.risk_flags = snapped["risk_level"], snapped["risk_flags"]
                case.ms = out["ms"]
                case.input_tokens = out["usage"]["input_tokens"]
                case.output_tokens = out["usage"]["output_tokens"]
            db.add(case)
            run.n_done += 1
            db.commit()
            if run.n_done % 10 == 0 or run.n_done == len(plan):
                print(f"  {run.n_done}/{len(plan)}", file=sys.stderr)
        cases = db.scalars(select(EvalCase).where(EvalCase.run_id == run.id)).all()
        run.metrics = compute_metrics(cases)
        run.status = "done"
    except (StopBatch, KeyboardInterrupt) as exc:
        db.rollback()
        run.status = "stopped"
        run.metrics = {"note": str(exc) or "interrupted"}
        raise StopBatch(str(exc) or "interrupted") from exc
    finally:
        run.finished_at = datetime.now()
        db.commit()
    return run


def _on_sigterm(signum, frame):  # docker stop/restart sends SIGTERM
    raise KeyboardInterrupt("stopped by SIGTERM")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--variants", default=None, help="Comma list, e.g. rules,v2,v4")
    ap.add_argument("--n", type=int, default=100)
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--rpm", type=int, default=8)
    ap.add_argument("--consistency", type=int, default=10)
    ap.add_argument("--max-calls", type=int, default=None)
    ap.add_argument("--name", default=None)
    ap.add_argument("--resume", metavar="BATCH_NAME", default=None)
    args = ap.parse_args()
    signal.signal(signal.SIGTERM, _on_sigterm)

    init_db()
    db = SessionLocal()
    taxonomy = load_taxonomy(db)

    if args.resume:
        name = args.resume
        runs = db.scalars(select(EvalRun).where(EvalRun.name == name).order_by(EvalRun.id)).all()
        if not runs:
            raise SystemExit(f'No batch named "{name}". Names are shown in the Evaluation page selector.')
        ids = (runs[0].config or {}).get("complaint_ids") or []
        seed = (runs[0].config or {}).get("seed", args.seed)
        consistency = max((r.config or {}).get("consistency", 0) for r in runs)
        variants = [v.strip() for v in args.variants.split(",")] if args.variants else list(dict.fromkeys(r.variant for r in runs))
    else:
        variants = [v.strip() for v in (args.variants or "rules,v2,v4").split(",") if v.strip()]
        ids = sample_ids(db, args.n, args.seed)
        seed, consistency = args.seed, args.consistency
        name = args.name or datetime.now().strftime("eval %Y-%m-%d %H:%M")
        taken = db.scalar(select(func.count()).select_from(EvalRun).where(EvalRun.name == name))
        if taken:
            raise SystemExit(f'A batch named "{name}" already exists. Use --resume "{name}" or a new --name.')

    known = {"rules", *PROMPT_VERSIONS, *TRAINED_VARIANTS}
    bad = [v for v in variants if v not in known]
    if bad:
        raise SystemExit(f"Unknown variant(s) {bad}. Choose from {', '.join(sorted(known))}")
    if not ids:
        raise SystemExit("No test-split complaints with CFPB labels. Load data first (scripts.load_cfpb).")

    llm_variants = [v for v in variants if v in PROMPT_VERSIONS]
    est = len(llm_variants) * (len(ids) + 2 * min(consistency, len(ids)))
    print(f'Batch "{name}": {len(ids)} complaints, variants {", ".join(variants)}.', file=sys.stderr)
    if est and args.rpm:
        print(f"Up to {est} LLM calls at <= {args.rpm}/min: roughly {est / args.rpm:.0f} minutes "
              f"(less when resuming).", file=sys.stderr)

    pacer, budget = Pacer(args.rpm), Budget(args.max_calls)
    try:
        for v in variants:
            run = run_variant(db, v, ids, taxonomy, name, seed, args.rpm, consistency,
                              pacer=pacer, budget=budget, resume=bool(args.resume))
            if run and run.status == "done":
                m = run.metrics
                print(f"  -> product {m.get('product_accuracy')}  issue {m.get('issue_accuracy')}  "
                      f"top-2 {m.get('issue_top2_accuracy')}  valid labels {m.get('label_valid_rate')}  "
                      f"errors {m.get('errors')}", file=sys.stderr)
    except StopBatch as exc:
        print(f'\nStopped: {exc}\nResume later with:\n  python -m scripts.run_eval --resume "{name}"', file=sys.stderr)
        sys.exit(2)
    print("\nDone. Open the Evaluation page to compare runs.")


if __name__ == "__main__":
    main()
