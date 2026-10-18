"""State and structured-output schemas shared by the agents."""
from typing import Literal, TypedDict

from pydantic import BaseModel, Field

RiskFlag = Literal[
    "fraud_or_unauthorized",
    "identity_theft",
    "discrimination",
    "servicemember",
    "legal_threat",
    "financial_hardship",
    "fee_or_interest_dispute",
    "repeat_contact",
]

HIGH_RISK_FLAGS = {"fraud_or_unauthorized", "identity_theft", "discrimination", "servicemember", "legal_threat"}


class Classification(BaseModel):
    product: str = Field(description="One product from the taxonomy, copied exactly")
    issue: str = Field(description="One issue listed under the chosen product, copied exactly")
    sentiment: Literal["negative", "neutral", "positive"]
    urgency: Literal["low", "medium", "high"]
    risk_flags: list[RiskFlag] = Field(default_factory=list)
    risk_level: Literal["low", "medium", "high"]
    risk_reason: str = Field(description="One sentence explaining the risk level")
    confidence: float = Field(ge=0, le=1, description="Confidence in the product label, 0 to 1")
    summary: str = Field(description="Neutral 2-3 sentence summary of the complaint for an analyst")


class ClassificationV4(Classification):
    issue_alt: str = Field(description="Second most likely issue under the same product, copied exactly")


class Draft(BaseModel):
    reply: str = Field(description="Draft response letter to the consumer")


class TriageState(TypedDict, total=False):
    complaint_id: int
    narrative: str            # PII-redacted narrative (original language)
    narrative_en: str         # English text used by the classifier (translation if needed)
    language: str             # en | es | other
    translation: str | None
    injection: dict           # prompt-injection screen result
    grounding: dict           # hallucination check of the draft
    date_received: str | None
    taxonomy: dict[str, list[str]]   # product -> CFPB issues
    examples: list[dict] | None      # few-shot examples (prompt v3 only)
    classification: dict
    citations: list[dict]
    prior_similar: int
    route: str                # auto_draft | compliance
    deadline: str
    draft_reply: str | None
    trace: list[dict]
