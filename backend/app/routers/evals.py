"""Evaluation runs API: list/compare runs, drill into one, export for the report."""
import csv
import io

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import PlainTextResponse, StreamingResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db import get_db
from app.evaluation import per_product
from app.models import EvalCase, EvalRun
from app.security import current_user

router = APIRouter(prefix="/eval", dependencies=[Depends(current_user)])

VARIANT_LABELS = {
    "rules": "Keyword rules (non-GenAI baseline)",
    "v1": "v1 zero-shot, free-text issue",
    "v2": "v2 zero-shot + CFPB taxonomy",
    "v3": "v3 few-shot + CFPB taxonomy",
    "v4": "v4 taxonomy + disambiguation rules",
}


def _run(r: EvalRun) -> dict:
    cfg = {k: v for k, v in (r.config or {}).items() if k != "complaint_ids"}
    return {
        "id": r.id, "name": r.name, "variant": r.variant, "label": VARIANT_LABELS.get(r.variant, r.variant),
        "model": r.model, "status": r.status, "n_planned": r.n_planned, "n_done": r.n_done,
        "metrics": r.metrics or {}, "config": cfg,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
    }


@router.get("/runs")
def list_runs(db: Session = Depends(get_db)):
    runs = db.scalars(select(EvalRun).order_by(EvalRun.id.desc()).limit(100)).all()
    return [_run(r) for r in runs]


@router.get("/batches")
def list_batches(db: Session = Depends(get_db)):
    """Run batches (one `run_eval` invocation = one name), newest first."""
    out: dict[str, dict] = {}
    for r in db.scalars(select(EvalRun).order_by(EvalRun.id.desc())).all():
        b = out.setdefault(r.name, {"name": r.name, "runs": 0, "done": 0, "running": 0,
                                    "n": (r.config or {}).get("n"), "started_at": None})
        b["runs"] += 1
        b["done"] += r.status == "done"
        b["running"] += r.status == "running"
        b["started_at"] = r.started_at.isoformat() if r.started_at else b["started_at"]
    return list(out.values())


@router.get("/runs/{run_id}")
def get_run(run_id: int, db: Session = Depends(get_db)):
    r = db.get(EvalRun, run_id)
    if not r:
        raise HTTPException(404, "Run not found")
    cases = db.scalars(select(EvalCase).where(EvalCase.run_id == run_id).order_by(EvalCase.id)).all()
    misses = [
        {"complaint_id": c.complaint_id, "true_product": c.true_product, "pred_product": c.pred_product,
         "true_issue": c.true_issue, "pred_issue": c.pred_issue, "raw_issue": c.raw_issue}
        for c in cases if c.repeat == 0 and not c.error and (c.pred_product != c.true_product or c.pred_issue != c.true_issue)
    ][:50]
    errors = [{"complaint_id": c.complaint_id, "error": c.error} for c in cases if c.error][:20]
    return {**_run(r), "per_product": per_product(cases), "misses": misses, "errors": errors}


@router.get("/runs/{run_id}/cases.csv")
def run_csv(run_id: int, db: Session = Depends(get_db)):
    cases = db.scalars(select(EvalCase).where(EvalCase.run_id == run_id).order_by(EvalCase.id)).all()
    if not cases:
        raise HTTPException(404, "No cases for this run")
    buf = io.StringIO()
    cols = ["complaint_id", "repeat", "true_product", "pred_product", "true_issue", "pred_issue", "raw_issue",
            "in_taxonomy", "risk_level", "ms", "input_tokens", "output_tokens", "error"]
    w = csv.writer(buf)
    w.writerow(cols)
    for c in cases:
        w.writerow([getattr(c, k) for k in cols])
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f'attachment; filename="eval_run_{run_id}.csv"'})


def _fmt(v, pct=False):
    if v is None:
        return "—"
    return f"{v * 100:.1f}%" if pct else str(v)


@router.get("/report.md", response_class=PlainTextResponse)
def report_markdown(name: str | None = None, db: Session = Depends(get_db)):
    """Comparison table (markdown) of the latest finished run per variant, or of one named batch."""
    q = select(EvalRun).where(EvalRun.status == "done").order_by(EvalRun.id.desc())
    if name:
        q = q.where(EvalRun.name == name)
    latest: dict[str, EvalRun] = {}
    for r in db.scalars(q).all():
        latest.setdefault(r.variant, r)
    order = ["rules", "v1", "v2", "v3", "v4"]
    runs = [latest[v] for v in order if v in latest] + [r for v, r in latest.items() if v not in order]
    lines = [
        "| Variant | Model | n | Product acc. | Product macro-F1 | Issue acc. | Issue top-2 | Valid labels | High-risk rate | Consistency | Latency mean / p95 (ms) | Tokens in / out | Cost per 1k |",
        "|---|---|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for r in runs:
        m = r.metrics or {}
        cost = f"${m['cost_per_1k_usd']}" if m.get("cost_per_1k_usd") is not None else "—"
        lines.append(
            f"| {VARIANT_LABELS.get(r.variant, r.variant)} | {r.model} | {m.get('n')} | {_fmt(m.get('product_accuracy'), True)} | "
            f"{_fmt(m.get('product_macro_f1'))} | {_fmt(m.get('issue_accuracy'), True)} | {_fmt(m.get('issue_top2_accuracy'), True)} | {_fmt(m.get('label_valid_rate'), True)} | "
            f"{_fmt(m.get('high_risk_rate'), True)} | {_fmt(m.get('consistency'), True)} | "
            f"{_fmt(m.get('latency_ms_mean'))} / {_fmt(m.get('latency_ms_p95'))} | "
            f"{m.get('input_tokens_mean', 0)} / {m.get('output_tokens_mean', 0)} | {cost} |"
        )
    seeds = {(r.config or {}).get("seed") for r in runs}
    lines.append("")
    lines.append(f"All variants scored on the same held-out complaints (test split, seed {', '.join(map(str, seeds))}). "
                 "Accuracy is exact match against the CFPB's own product/issue labels.")
    return "\n".join(lines) + "\n"
