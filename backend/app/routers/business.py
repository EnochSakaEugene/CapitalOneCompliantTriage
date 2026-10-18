"""Business case inputs measured from the running system (the ROI math runs in the browser
so assumptions can be changed live during the presentation)."""
from collections import Counter
from statistics import mean

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.costs import prices_set, trace_cost
from app.db import get_db
from app.models import Complaint, EvalRun, Triage
from app.security import current_user

router = APIRouter(prefix="/business", dependencies=[Depends(current_user)])
settings = get_settings()


@router.get("/baseline")
def baseline(db: Session = Depends(get_db)):
    dates = db.scalars(select(Complaint.date_received).where(Complaint.date_received.is_not(None),
                                                            Complaint.source != "intake")).all()
    by_month = Counter(d.strftime("%Y-%m") for d in dates)
    tris = db.scalars(select(Triage)).all()
    real = [t for t in tris if not (t.model_info or {}).get("mock")]
    use = real or tris
    costs = [c for c in (trace_cost((t.model_info or {}).get("trace", [])) for t in use) if c is not None]
    grounded = [t.grounding["score"] for t in use if t.grounding and t.grounding.get("score") is not None]
    edits = [t.edit_ratio for t in use if t.edit_ratio is not None]

    best = None
    for r in db.scalars(select(EvalRun).where(EvalRun.status == "done")).all():
        acc = (r.metrics or {}).get("product_accuracy")
        if acc is not None and not r.variant.startswith("draft-") and (best is None or acc > best["product_accuracy"]):
            best = {"name": r.name, "variant": r.variant, "model": r.model, "product_accuracy": acc,
                    "issue_accuracy": (r.metrics or {}).get("issue_accuracy"), "n": (r.metrics or {}).get("n")}
    return {
        "loaded_by_month": sorted(by_month.items()),
        "loaded_total": len(dates),
        "cases_measured": len(use),
        "measured_from_live_llm": bool(real),
        "ai_seconds_per_case": round(mean([t.total_ms for t in use if t.total_ms] or [0]) / 1000, 1) if use else None,
        "tokens_per_case": round(mean([(t.tokens_in or 0) + (t.tokens_out or 0) for t in use])) if use else None,
        "ai_cost_per_case_usd": round(mean(costs), 5) if costs else None,
        "prices_set": prices_set(),
        "escalation_rate": round(sum(t.route == "compliance" for t in use) / len(use), 3) if use else None,
        "grounded_mean": round(mean(grounded), 3) if grounded else None,
        "edit_ratio_mean": round(mean(edits), 3) if edits else None,
        "best_eval": best,
        "mock": settings.mock_llm,
    }
