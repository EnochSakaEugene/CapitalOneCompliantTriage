"""Rule-based stand-ins for the LLM, used when no OPENAI_API_KEY is set.

They keep the system runnable offline and give a simple baseline to compare the
LLM against on the Evaluation page.
"""
import re

PRODUCT_KEYWORDS: list[tuple[str, list[str]]] = [
    ("credit report", ["credit report", "equifax", "experian", "transunion", "credit bureau", "inquiry", "fcra"]),
    ("debt collection", ["collection agency", "debt collector", "collections", "collector"]),
    ("vehicle", ["auto loan", "car loan", "vehicle", "repossess"]),
    ("checking or savings", ["checking", "savings", "360", "debit card", "overdraft", "deposit", "atm"]),
    ("mortgage", ["mortgage", "escrow"]),
    ("money transfer", ["zelle", "wire transfer", "money transfer"]),
    ("credit card", ["credit card", "card", "statement", "credit limit", "apr", "rewards", "miles"]),
]

FLAG_KEYWORDS: dict[str, list[str]] = {
    "fraud_or_unauthorized": ["fraud", "unauthorized", "did not make", "didn't make", "never made", "scam", "stolen"],
    "identity_theft": ["identity theft", "stole my identity", "opened in my name", "not my account"],
    "discrimination": ["discriminat", "because of my race", "racist", "because i am a", "religion", "national origin"],
    "servicemember": ["military", "servicemember", "service member", "scra", "deployed", "active duty"],
    "legal_threat": ["lawyer", "attorney", "lawsuit", "sue ", "legal action", "small claims"],
    "financial_hardship": ["hardship", "lost my job", "unemployed", "medical bills", "can't afford", "cannot afford"],
    "fee_or_interest_dispute": ["late fee", "annual fee", "interest charge", "overdraft fee", "fee", "interest"],
    "repeat_contact": ["called multiple times", "several times", "again and again", "numerous times", "months now"],
}

ISSUE_BY_PRODUCT = {
    "credit report": "Incorrect information on your report",
    "debt collection": "Attempts to collect debt not owed",
    "vehicle": "Managing the loan or lease",
    "checking or savings": "Managing an account",
    "mortgage": "Trouble during payment process",
    "money transfer": "Fraud or scam",
    "credit card": "Problem with a purchase shown on your statement",
}


def _first_sentences(text: str, n: int = 2, limit: int = 320) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    out = " ".join(parts[:n])
    return out[:limit] + ("..." if len(out) > limit else "")


def classify(narrative: str, allowed_products: list[str]) -> dict:
    t = narrative.lower()
    key = "credit card"
    for k, words in PRODUCT_KEYWORDS:
        if any(w in t for w in words):
            key = k
            break
    product = next((p for p in allowed_products if key in p.lower()), None)
    if product is None:
        product = allowed_products[0] if allowed_products else "Credit card"
    flags = [f for f, words in FLAG_KEYWORDS.items() if any(w in t for w in words)]
    from app.agents.schemas import HIGH_RISK_FLAGS

    if set(flags) & HIGH_RISK_FLAGS:
        level = "high"
    elif flags:
        level = "medium"
    else:
        level = "low"
    angry = sum(t.count(w) for w in ["!!", "unacceptable", "ridiculous", "furious", "worst"])
    return {
        "product": product,
        "issue": ISSUE_BY_PRODUCT.get(key, "Other"),
        "sentiment": "negative" if angry or flags else "neutral",
        "urgency": "high" if level == "high" else ("medium" if level == "medium" else "low"),
        "risk_flags": flags,
        "risk_level": level,
        "risk_reason": f"Keyword rules matched: {', '.join(flags)}" if flags else "No risk keywords matched.",
        "confidence": 0.55,
        "summary": "Consumer reports: " + _first_sentences(narrative),
    }


def draft(classification: dict, citations: list[dict]) -> str:
    rule = citations[0]["title"] if citations else "applicable consumer protection rules"
    return (
        "Dear Customer,\n\n"
        f"Thank you for contacting us about your {classification['product'].lower()} concern "
        f"({classification['issue'].lower()}). We are sorry for the frustration this has caused.\n\n"
        "We have opened a review of your account activity and the points you raised. "
        f"We will handle your request in line with {rule}, and we will contact you with the "
        "outcome and any corrective steps once the review is complete.\n\n"
        "If you have additional information, please reply to this message.\n\n"
        "Sincerely,\n[Analyst name]\nCustomer Resolution Team\n\n"
        "[MOCK DRAFT - generated without an LLM]"
    )
