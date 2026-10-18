"""One classification call, shared by the live pipeline and the evaluation runner."""
import time

from app.agents import mock_rules
from app.agents.prompts import classify_messages
from app.agents.schemas import Classification, ClassificationV4
from app.config import get_settings
from app.llm import structured, usage_of

settings = get_settings()


def classify(version: str, narrative: str, taxonomy: dict[str, list[str]],
             examples: list[dict] | None = None) -> dict:
    """Return {"result": dict, "usage": {...}, "ms": int, "in_taxonomy": bool}.

    version "rules" (or mock mode) uses the keyword baseline. in_taxonomy tells whether
    the model's raw product/issue were valid CFPB labels before any snapping, which is
    our measure of label hallucination.
    """
    t0 = time.perf_counter()
    if version == "rules" or settings.mock_llm:
        result = mock_rules.classify(narrative, taxonomy)
        usage = {"input_tokens": 0, "output_tokens": 0}
    else:
        schema = ClassificationV4 if version == "v4" else Classification
        out = structured(schema, include_raw=True).invoke(classify_messages(version, narrative, taxonomy, examples))
        if out.get("parsing_error") or out.get("parsed") is None:
            raise ValueError(f"Model output did not match the schema: {out.get('parsing_error')}")
        result = out["parsed"].model_dump()
        usage = usage_of(out.get("raw"))
    in_tax = result["product"] in taxonomy and result["issue"] in taxonomy.get(result["product"], [])
    return {"result": result, "usage": usage, "ms": round((time.perf_counter() - t0) * 1000), "in_taxonomy": in_tax}
