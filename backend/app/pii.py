"""Simple PII redaction applied before any text is sent to an LLM.

CFPB narratives are already scrubbed by the CFPB (shown as XXXX), but a production
system would receive raw text, so the pipeline always redacts first. This is a
regex baseline; a stronger option is Microsoft Presidio.
"""
import re

PATTERNS: list[tuple[str, re.Pattern]] = [
    ("EMAIL", re.compile(r"[\w.+-]+@[\w-]+\.[\w.-]+")),
    ("SSN", re.compile(r"\b\d{3}-\d{2}-\d{4}\b")),
    ("CARD", re.compile(r"\b(?:\d[ -]?){13,16}\b")),
    ("PHONE", re.compile(r"\(?\b\d{3}\)?[ .-]?\d{3}[ .-]?\d{4}\b")),
    ("ACCOUNT", re.compile(r"\b(?:acct|account)\s*(?:#|no\.?|number)?\s*\d{6,}\b", re.I)),
]


def redact(text: str) -> tuple[str, dict[str, int]]:
    """Return redacted text and a count of redactions by type."""
    counts: dict[str, int] = {}
    for label, pattern in PATTERNS:
        text, n = pattern.subn(f"[{label}]", text)
        if n:
            counts[label] = n
    return text, counts
