"""Token cost estimates from the per-step token counts in each case's agent trace.

Drafting uses the strong model; every other LLM step uses the fast model. Prices come from
.env (PRICE_*_PER_MTOK_*), copied from the provider's pricing page; None when not set.
"""
from app.config import get_settings

settings = get_settings()


def prices_set() -> bool:
    return any([settings.price_input_per_mtok_fast, settings.price_output_per_mtok_fast,
                settings.price_input_per_mtok_strong, settings.price_output_per_mtok_strong])


def step_cost(step: dict) -> float:
    tin, tout = step.get("tokens_in", 0) or 0, step.get("tokens_out", 0) or 0
    if step.get("agent") == "draft":
        pin, pout = settings.price_input_per_mtok_strong, settings.price_output_per_mtok_strong
    else:
        pin, pout = settings.price_input_per_mtok_fast, settings.price_output_per_mtok_fast
    return (tin * pin + tout * pout) / 1e6


def trace_cost(trace: list[dict]) -> float | None:
    if not prices_set():
        return None
    return sum(step_cost(s) for s in trace or [])
