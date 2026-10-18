"""Rule-based stand-ins for the LLM, used when no OPENAI_API_KEY is set.

They keep the system runnable offline and give a simple baseline to compare the
LLM against on the Evaluation page. Keywords match whole words/phrases only.
"""
import re

# (key, keywords). Order matters: more specific products first, credit card last.
# "key" is matched against the product names that actually exist in the loaded data.
PRODUCT_KEYWORDS: list[tuple[str, list[str]]] = [
    ("debt collection", ["collection agency", "debt collector", "collections agency", "collector"]),
    ("vehicle", ["auto loan", "car loan", "vehicle", "repossess", "repossessed", "repossession", "auto finance"]),
    ("money transfer", ["zelle", "wire transfer", "money transfer", "paypal", "venmo", "cash app"]),
    ("checking or savings", ["checking account", "savings account", "360 checking", "360 savings",
                             "debit card", "overdraft", "atm", "direct deposit", "bank account"]),
    ("mortgage", ["mortgage", "escrow"]),
    ("personal loan", ["personal loan", "payday"]),
    ("credit report", ["credit report", "credit bureau", "equifax", "experian", "transunion"]),
    ("credit card", ["credit card", "credit limit", "card", "statement", "apr", "rewards", "miles", "cardholder"]),
]

FLAG_KEYWORDS: dict[str, list[str]] = {
    "fraud_or_unauthorized": ["fraudulent charge", "fraudulent charges", "unauthorized charge", "unauthorized charges",
                              "unauthorized transaction", "unauthorized transactions", "did not authorize",
                              "didn't authorize", "did not make", "never made", "scammed", "stolen card"],
    "identity_theft": ["identity theft", "stole my identity", "opened in my name", "victim of identity"],
    "discrimination": ["discriminate", "discriminated", "discrimination", "discriminatory", "racist",
                       "because of my race", "national origin"],
    "servicemember": ["military", "servicemember", "service member", "scra", "deployed", "active duty"],
    "legal_threat": ["lawyer", "attorney", "lawsuit", "sue", "legal action", "small claims"],
    "financial_hardship": ["hardship", "lost my job", "unemployed", "medical bills", "can't afford", "cannot afford"],
    "fee_or_interest_dispute": ["late fee", "annual fee", "overdraft fee", "interest charge", "interest charges",
                                "finance charge", "fees"],
    "repeat_contact": ["called multiple times", "several times", "numerous times", "multiple times",
                       "countless times", "for months"],
}

ISSUE_BY_PRODUCT = {
    "debt collection": "Attempts to collect debt not owed",
    "vehicle": "Managing the loan or lease",
    "money transfer": "Fraud or scam",
    "checking or savings": "Managing an account",
    "mortgage": "Trouble during payment process",
    "personal loan": "Getting the loan",
    "credit report": "Incorrect information on your report",
    "credit card": "Problem with a purchase shown on your statement",
}


def _pattern(words: list[str]) -> re.Pattern:
    return re.compile(r"\b(?:" + "|".join(re.escape(w) for w in words) + r")\b", re.I)


PRODUCT_PATTERNS = [(k, _pattern(w)) for k, w in PRODUCT_KEYWORDS]
FLAG_PATTERNS = {f: _pattern(w) for f, w in FLAG_KEYWORDS.items()}


def _first_sentences(text: str, n: int = 2, limit: int = 320) -> str:
    parts = re.split(r"(?<=[.!?])\s+", text.strip())
    out = " ".join(parts[:n])
    return out[:limit] + ("..." if len(out) > limit else "")


def _pick_product(text: str, allowed: list[str]) -> tuple[str, str, float]:
    """Return (product, key, confidence). Scores every product by keyword hits."""
    scores = []
    for key, pat in PRODUCT_PATTERNS:
        hits = len(pat.findall(text))
        product = next((p for p in allowed if key in p.lower()), None)
        if hits and product:
            scores.append((hits, key, product))
    if scores:
        scores.sort(key=lambda s: s[0], reverse=True)
        hits, key, product = scores[0]
        margin = hits - (scores[1][0] if len(scores) > 1 else 0)
        return product, key, round(min(0.9, 0.5 + 0.1 * margin), 2)
    # Nothing matched: fall back to the most common Capital One product.
    product = next((p for p in allowed if "credit card" in p.lower()), allowed[0] if allowed else "Credit card")
    return product, "credit card", 0.3


def classify(narrative: str, allowed_products: list[str]) -> dict:
    from app.agents.schemas import HIGH_RISK_FLAGS

    product, key, confidence = _pick_product(narrative, allowed_products)
    flags = [f for f, pat in FLAG_PATTERNS.items() if pat.search(narrative)]
    if set(flags) & HIGH_RISK_FLAGS:
        level = "high"
    elif flags:
        level = "medium"
    else:
        level = "low"
    t = narrative.lower()
    angry = sum(t.count(w) for w in ["!!", "unacceptable", "ridiculous", "furious", "worst"])
    return {
        "product": product,
        "issue": ISSUE_BY_PRODUCT.get(key, "Other"),
        "sentiment": "negative" if angry or flags else "neutral",
        "urgency": level,
        "risk_flags": flags,
        "risk_level": level,
        "risk_reason": f"Keyword rules matched: {', '.join(flags)}" if flags else "No risk keywords matched.",
        "confidence": confidence,
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
