"""Governance API: human oversight metrics, model card, fairness checks and the risk register."""
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.audit import log_event
from app.config import get_settings
from app.db import get_db
from app.llm import model_name
from app.models import AuditEvent, Complaint, PolicyChunk, RiskItem, Triage, User
from app.security import current_user, require_roles

# Every signed-in role can view governance; only Compliance (and Admin) can change the risk register.
router = APIRouter(prefix="/governance", dependencies=[Depends(current_user)])
settings = get_settings()
LEVELS = {"low", "medium", "high"}
STATUSES = {"open", "monitoring", "mitigated"}
MIN_GROUP = 20  # groups smaller than this are flagged as too small to compare

OLD_INJ_MIT = "System prompts treat complaint text as data; structured outputs with fixed schemas; human review of replies."
NEW_INJ_MIT = ("Rule-based injection screen before any LLM call (red-team tested on the Governance page); flagged "
               "complaints go to Compliance with no auto-draft; prompts treat complaint text as data; fixed output "
               "schemas; output check for leaked instructions; human approval of every reply.")

DEFAULT_RISKS = [
    ("Missed escalation: a high-risk complaint (fraud, discrimination, servicemember) is routed to auto-draft",
     "accuracy", "medium", "high",
     "Conservative high-risk flags; any high-risk flag forces Compliance routing; analysts can escalate any case; "
     "track human overrides of AI routing.", "override_rate"),
    ("Hallucinated or wrong policy citations in draft replies",
     "accuracy", "medium", "high",
     "Drafts grounded only in retrieved policy text; citations shown to the reviewer; every reply needs human "
     "approval; knowledge base reviewed by the team.", "approve_without_edit_rate"),
    ("Misclassification of product or issue skews routing and trend reports",
     "accuracy", "medium", "medium",
     "Labels restricted to the CFPB taxonomy; accuracy measured against CFPB labels on a held-out set.",
     "product_accuracy"),
    ("Unequal treatment across consumer groups (e.g. Servicemember, Older American, state)",
     "fairness", "low", "high",
     "Fairness table compares risk, escalation and accuracy rates by tag and state; investigate gaps on large groups.",
     None),
    ("Personal data sent to an external LLM provider",
     "privacy", "medium", "high",
     "Regex PII redaction before every LLM call (Presidio planned); CFPB narratives are pre-scrubbed; "
     "redaction counts logged.", "pii_redactions"),
    ("Prompt injection: complaint text tries to change the AI's instructions",
     "security", "low", "medium",
     NEW_INJ_MIT,
     "injection_flags"),
    ("Automation bias: analysts approve AI drafts without real review",
     "oversight", "medium", "medium",
     "Approve-without-edit rate monitored; reviewer and edits recorded in the audit log; periodic sample audits.",
     "approve_without_edit_rate"),
    ("Model or provider change alters behaviour without notice",
     "operational", "medium", "medium",
     "Model names pinned in configuration and recorded on every case; re-run evaluation after any model change.",
     None),
    ("Data drift: CFPB stopped publishing narratives in Aug 2026, so training/evaluation data ages",
     "operational", "high", "medium",
     "Document data window (Jan-Jul 2026 archive); in production, evaluate on the company's own recent complaints.",
     None),
]


# Added after the first release; seeded into existing registers once (matched by risk text).
ADDED_RISKS = [
    ("Copyright / IP: generated replies or the knowledge base reproduce third-party text without permission",
     "legal", "low", "medium",
     "Knowledge base holds team-written summaries of public regulations (government works) with source links, "
     "not copied commercial text; replies are short original drafts reviewed by staff; AI tools used are "
     "documented in the report as the course requires.", None),
    ("Misuse: staff use TriageIQ to auto-deny claims, pressure customers or skip required investigations",
     "misuse", "low", "high",
     "The system never sends, closes or denies on its own; drafts may not admit liability or promise outcomes; "
     "high-risk cases require Compliance; every action is logged per user for audit; role-based permissions.",
     None),
    ("Hallucinated facts in a draft reach a customer",
     "accuracy", "medium", "high",
     "Independent hallucination check on every draft (claims vs. policy excerpts); unsupported sentences "
     "highlighted to the reviewer; RAG ablation measured; human approval required.", "grounded_mean"),
    ("Unequal service for customers who write in Spanish or other languages",
     "fairness", "medium", "medium",
     "Language detection, translation for analysts and replies in the customer's language; monitor accuracy "
     "and escalation by language once volumes allow.", None),
    ("Over-reliance on historical data for trend alerts (CFPB narratives end Aug 2026)",
     "operational", "medium", "low",
     "Emerging-issue alerts state their data window; in production they run on live TriageIQ labels.", None),
]


class RiskIn(BaseModel):
    risk: str = Field(min_length=5, max_length=300)
    category: str = Field(min_length=3, max_length=50)
    likelihood: str = "medium"
    impact: str = "medium"
    mitigation: str = Field(default="", max_length=3000)
    owner: str = Field(default="Unassigned", max_length=100)
    status: str = "open"


def _seed(db: Session) -> None:
    existing = db.scalars(select(RiskItem)).all()
    if not existing:
        for risk, cat, lik, imp, mit, ind in DEFAULT_RISKS:
            db.add(RiskItem(risk=risk, category=cat, likelihood=lik, impact=imp, mitigation=mit, indicator=ind))
    texts = {r.risk for r in existing}
    for risk, cat, lik, imp, mit, ind in ADDED_RISKS:
        if existing and risk not in texts:
            db.add(RiskItem(risk=risk, category=cat, likelihood=lik, impact=imp, mitigation=mit, indicator=ind))
    if not existing:
        for risk, cat, lik, imp, mit, ind in ADDED_RISKS:
            db.add(RiskItem(risk=risk, category=cat, likelihood=lik, impact=imp, mitigation=mit, indicator=ind))
    for r in existing:  # upgrade the original prompt-injection row if nobody edited it
        if r.mitigation == OLD_INJ_MIT:
            r.mitigation, r.indicator = NEW_INJ_MIT, "injection_flags"
    db.commit()


def _pct(a: int, b: int) -> float | None:
    return round(a / b, 3) if b else None


def _oversight(db: Session) -> dict:
    actions = dict(db.execute(
        select(AuditEvent.action, func.count()).where(AuditEvent.actor.like("user:%")).group_by(AuditEvent.action)
    ).all())
    approvals = db.scalars(select(AuditEvent.detail).where(AuditEvent.action == "approve")).all()
    edited = sum(1 for d in approvals if (d or {}).get("edited"))
    # The AI's own routing decision per case (latest agent:route step), so human changes don't hide it.
    ai_route: dict[int, str] = {}
    for cid, detail in db.execute(
        select(AuditEvent.complaint_id, AuditEvent.detail).where(AuditEvent.actor == "agent:route").order_by(AuditEvent.id)
    ).all():
        ai_route[cid] = (detail or {}).get("route")
    ai_auto = {cid for cid, r in ai_route.items() if r == "auto_draft"}
    human_escalated_ids = set(db.scalars(
        select(AuditEvent.complaint_id).where(AuditEvent.action == "escalate", AuditEvent.actor.like("user:%"))
    ).all())
    triaged = db.scalar(select(func.count()).select_from(Triage)) or 0
    ai_escalated = sum(1 for r in ai_route.values() if r == "compliance")
    reviewed = len(approvals) + len(human_escalated_ids) + actions.get("close", 0)
    redactions = 0
    for d in db.scalars(select(AuditEvent.detail).where(AuditEvent.actor == "system:pii")).all():
        redactions += sum((d or {}).get("redactions", {}).values())
    return {
        "triaged": triaged,
        "ai_escalated": ai_escalated,
        "approved": len(approvals),
        "approved_with_edits": edited,
        "human_escalations": len(human_escalated_ids),
        "closed": actions.get("close", 0),
        "reviewed": reviewed,
        "edit_rate": _pct(edited, len(approvals)),
        "approve_without_edit_rate": _pct(len(approvals) - edited, len(approvals)),
        "overrides": len(human_escalated_ids & ai_auto),
        "override_rate": _pct(len(human_escalated_ids & ai_auto), len(ai_auto)),
        "pii_redactions": redactions,
        "policy_changes": sum(actions.get(a, 0) for a in ("policy_update", "policy_create", "policy_reindex")),
    }


def _accuracy(db: Session) -> dict:
    rows = db.execute(
        select(Complaint.product, Complaint.issue, Triage.pred_product, Triage.pred_issue).join(Triage)
    ).all()
    n = len(rows)
    return {
        "n": n,
        "product_accuracy": _pct(sum(r[0] == r[2] for r in rows), n),
        "issue_accuracy": _pct(sum(r[1] == r[3] for r in rows), n),
    }


def _fairness(db: Session) -> dict:
    rows = db.execute(
        select(Complaint.tags, Complaint.state, Complaint.product, Triage.pred_product,
               Triage.risk_level, Triage.route, Triage.confidence).join(Triage)
    ).all()

    def summarize(key_fn) -> list[dict]:
        groups: dict[str, list] = defaultdict(list)
        for r in rows:
            groups[key_fn(r)].append(r)
        out = []
        for name, items in groups.items():
            n = len(items)
            out.append({
                "group": name,
                "n": n,
                "high_risk_rate": _pct(sum(i.risk_level == "high" for i in items), n),
                "escalation_rate": _pct(sum(i.route == "compliance" for i in items), n),
                "product_accuracy": _pct(sum(i.product == i.pred_product for i in items), n),
                "avg_confidence": round(sum(i.confidence or 0 for i in items) / n, 3),
                "small_sample": n < MIN_GROUP,
            })
        return sorted(out, key=lambda g: g["n"], reverse=True)

    by_state = summarize(lambda r: r.state or "Unknown")
    return {
        "min_group": MIN_GROUP,
        "by_tag": summarize(lambda r: r.tags or "No tag"),
        "by_state": by_state[:10],
    }


def _model_card(db: Session, acc: dict) -> dict:
    chunks = db.scalar(select(func.count()).select_from(PolicyChunk)) or 0
    first, last = db.execute(select(func.min(Complaint.date_received), func.max(Complaint.date_received))).one()
    emb = {"gemini": settings.gemini_embedding_model, "openai": settings.embedding_model}.get(settings.provider, "hashed bag-of-words (mock)")
    return {
        "provider": settings.provider,
        "classification_model": model_name(),
        "drafting_model": model_name(True),
        "embedding_model": emb,
        "reasoning_effort": settings.gemini_reasoning_effort if settings.provider == "gemini" else None,
        "policy_sections": chunks,
        "data_window": [first.isoformat() if first else None, last.isoformat() if last else None],
        "complaints_loaded": db.scalar(select(func.count()).select_from(Complaint)) or 0,
        "evaluation": acc,
        "intended_use": "Assist complaint analysts and compliance officers: classify, prioritise, retrieve relevant "
                        "rules and draft replies for human review. Not for automated decisions about consumers.",
        "out_of_scope": "Sending replies without human approval; legal determinations; credit decisions; "
                        "use on complaints outside the products in the CFPB taxonomy loaded.",
        "limitations": [
            "Trained and evaluated on public CFPB narratives (Jan-Jul 2026), which are pre-scrubbed and may not "
            "match a bank's internal complaint channels.",
            "Confidence scores are the model's own estimate, not calibrated probabilities.",
            "Policy knowledge base contains team-written summaries that must be verified against sources.",
            "No ground-truth labels exist for risk level, so escalation quality is monitored through human overrides.",
        ],
    }


def _quality_indicators(db: Session) -> dict:
    tris = db.scalars(select(Triage).where(Triage.grounding.is_not(None))).all()
    scores = [t.grounding["score"] for t in tris if (t.grounding or {}).get("score") is not None]
    flags = db.scalar(select(func.count()).select_from(AuditEvent)
                      .where(AuditEvent.action == "prompt_injection_flagged")) or 0
    return {"grounded_mean": round(sum(scores) / len(scores), 3) if scores else None, "injection_flags": flags}


@router.get("/redteam")
def redteam_results(db: Session = Depends(get_db)):
    """Run the red-team set through the injection screen, plus a false-positive check on up to
    1,000 real CFPB complaints (assumed benign)."""
    from app import redteam
    from app.guard import screen

    result = redteam.run()
    narratives = db.scalars(select(Complaint.narrative).where(Complaint.source != "intake")
                            .order_by(Complaint.id).limit(1000)).all()
    flagged = [n[:200] for n in narratives if screen(n)["detected"]]
    result["real_checked"] = len(narratives)
    result["real_flagged"] = len(flagged)
    result["real_flag_rate"] = round(len(flagged) / len(narratives), 4) if narratives else None
    result["real_flagged_examples"] = flagged[:5]
    return result


@router.get("")
def overview(db: Session = Depends(get_db)):
    acc = _accuracy(db)
    oversight = _oversight(db)
    return {
        "oversight": oversight,
        "model_card": _model_card(db, acc),
        "fairness": _fairness(db),
        "indicators": {
            **_quality_indicators(db),
            "override_rate": oversight["override_rate"],
            "approve_without_edit_rate": oversight["approve_without_edit_rate"],
            "pii_redactions": oversight["pii_redactions"],
            "product_accuracy": acc["product_accuracy"],
        },
    }


def _risk_dict(r: RiskItem) -> dict:
    return {
        "id": r.id, "risk": r.risk, "category": r.category, "likelihood": r.likelihood, "impact": r.impact,
        "mitigation": r.mitigation, "indicator": r.indicator, "owner": r.owner, "status": r.status,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _validate(body: RiskIn) -> None:
    if body.likelihood not in LEVELS or body.impact not in LEVELS:
        raise HTTPException(400, "likelihood and impact must be low, medium or high")
    if body.status not in STATUSES:
        raise HTTPException(400, "status must be open, monitoring or mitigated")


@router.get("/risks")
def list_risks(db: Session = Depends(get_db)):
    _seed(db)
    order = {"high": 0, "medium": 1, "low": 2}
    items = db.scalars(select(RiskItem)).all()
    items = sorted(items, key=lambda r: (order[r.impact] + order[r.likelihood], r.id))
    return [_risk_dict(r) for r in items]


@router.post("/risks")
def create_risk(body: RiskIn, db: Session = Depends(get_db), user: User = Depends(require_roles("compliance"))):
    _validate(body)
    r = RiskItem(**body.model_dump())
    db.add(r)
    db.flush()
    log_event(db, f"user:{user.username}", "risk_create", None, risk_id=r.id, risk=body.risk[:120])
    db.commit()
    return _risk_dict(r)


@router.put("/risks/{risk_id}")
def update_risk(risk_id: int, body: RiskIn, db: Session = Depends(get_db),
                user: User = Depends(require_roles("compliance"))):
    _validate(body)
    r = db.get(RiskItem, risk_id)
    if not r:
        raise HTTPException(404, "Risk not found")
    changes = {k: v for k, v in body.model_dump().items() if getattr(r, k) != v}
    for k, v in changes.items():
        setattr(r, k, v)
    log_event(db, f"user:{user.username}", "risk_update", None, risk_id=risk_id, changed=sorted(changes))
    db.commit()
    db.refresh(r)
    return _risk_dict(r)
