"""Metrics for evaluation runs (used by the runner script and the API)."""
from collections import Counter, defaultdict
from statistics import mean

from app.config import get_settings
from app.models import EvalCase

settings = get_settings()


def _pct(a: int, b: int) -> float | None:
    return round(a / b, 3) if b else None


def _percentile(values: list[int], p: float) -> int | None:
    if not values:
        return None
    s = sorted(values)
    return s[min(len(s) - 1, int(round(p * (len(s) - 1))))]


def macro_f1(pairs: list[tuple[str, str]]) -> float | None:
    """Macro-averaged F1 over the true classes (pairs of (true, predicted))."""
    labels = {t for t, _ in pairs}
    if not labels:
        return None
    scores = []
    for lab in labels:
        tp = sum(1 for t, p in pairs if t == lab and p == lab)
        fp = sum(1 for t, p in pairs if t != lab and p == lab)
        fn = sum(1 for t, p in pairs if t == lab and p != lab)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        scores.append(2 * prec * rec / (prec + rec) if prec + rec else 0.0)
    return round(mean(scores), 3)


def compute_metrics(cases: list[EvalCase]) -> dict:
    main = [c for c in cases if c.repeat == 0]
    ok = [c for c in main if not c.error]
    n = len(ok)
    lat = [c.ms for c in ok if c.ms is not None]
    tin = [c.input_tokens for c in ok]
    tout = [c.output_tokens for c in ok]
    metrics = {
        "n": n,
        "errors": len(main) - n,
        "product_accuracy": _pct(sum(c.pred_product == c.true_product for c in ok), n),
        "issue_accuracy": _pct(sum(c.pred_issue == c.true_issue for c in ok), n),
        "issue_top2_accuracy": (
            _pct(sum(c.true_issue in (c.pred_issue, c.alt_issue) for c in ok), n)
            if any(c.alt_issue for c in ok) else None
        ),
        "product_macro_f1": macro_f1([(c.true_product, c.pred_product) for c in ok]),
        "label_valid_rate": _pct(sum(bool(c.in_taxonomy) for c in ok), n),
        "high_risk_rate": _pct(sum(c.risk_level == "high" for c in ok), n),
        "latency_ms_mean": round(mean(lat)) if lat else None,
        "latency_ms_p95": _percentile(lat, 0.95),
        "input_tokens_mean": round(mean(tin)) if tin else 0,
        "output_tokens_mean": round(mean(tout)) if tout else 0,
    }
    pin, pout = settings.price_input_per_mtok_fast, settings.price_output_per_mtok_fast
    metrics["cost_per_1k_usd"] = (
        round(1000 * (metrics["input_tokens_mean"] * pin + metrics["output_tokens_mean"] * pout) / 1e6, 4)
        if (pin or pout) else None
    )
    # Consistency: same complaint classified again -> same product, issue and risk level?
    groups: dict[int, list[EvalCase]] = defaultdict(list)
    for c in cases:
        if not c.error:
            groups[c.complaint_id].append(c)
    repeated = [g for g in groups.values() if len(g) > 1]
    if repeated:
        agree = sum(len({(c.pred_product, c.pred_issue, c.risk_level) for c in g}) == 1 for g in repeated)
        metrics["consistency"] = _pct(agree, len(repeated))
        metrics["consistency_n"] = len(repeated)
    else:
        metrics["consistency"] = None
        metrics["consistency_n"] = 0
    return metrics


def per_product(cases: list[EvalCase]) -> list[dict]:
    rows: dict[str, Counter] = defaultdict(Counter)
    for c in cases:
        if c.repeat or c.error:
            continue
        r = rows[c.true_product or "Unknown"]
        r["n"] += 1
        r["product_ok"] += c.pred_product == c.true_product
        r["issue_ok"] += c.pred_issue == c.true_issue
    return sorted(
        ({"product": k, "n": v["n"], "product_accuracy": _pct(v["product_ok"], v["n"]),
          "issue_accuracy": _pct(v["issue_ok"], v["n"])} for k, v in rows.items()),
        key=lambda r: r["n"], reverse=True,
    )
