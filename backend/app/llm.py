"""LLM and embedding access for Gemini, OpenAI, or mock mode.

Gemini and OpenAI are both used through LangChain, so the agents call the same
interface (`get_chat().with_structured_output(...)`) whichever provider is set.
Mock mode (no API key): a hashed bag-of-words embedding, and the agents fall
back to rule-based logic.
"""
import hashlib
import math
import re

from app.config import get_settings

settings = get_settings()


def get_chat(strong: bool = False, effort: bool = True):
    if settings.provider == "gemini":
        from langchain_google_genai import ChatGoogleGenerativeAI

        use = effort and settings.gemini_reasoning_effort
        extra = {"reasoning_effort": settings.gemini_reasoning_effort} if use else {}
        return ChatGoogleGenerativeAI(
            model=settings.gemini_model_strong if strong else settings.gemini_model_fast,
            google_api_key=settings.google_api_key,
            temperature=0.2 if strong else 0,
            max_output_tokens=settings.gemini_max_output_tokens,
            **extra,
        )
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.llm_model_strong if strong else settings.llm_model_fast,
        api_key=settings.openai_api_key,
        temperature=0.2 if strong else 0,
    )


def structured(schema, strong: bool = False):
    """Chat model that returns `schema`. On Gemini, if the model rejects the
    reasoning-effort setting, retry once with the model's default thinking."""
    runnable = get_chat(strong).with_structured_output(schema)
    if settings.provider == "gemini" and settings.gemini_reasoning_effort:
        runnable = runnable.with_fallbacks([get_chat(strong, effort=False).with_structured_output(schema)])
    return runnable


def model_name(strong: bool = False) -> str:
    if settings.provider == "gemini":
        return settings.gemini_model_strong if strong else settings.gemini_model_fast
    if settings.provider == "openai":
        return settings.llm_model_strong if strong else settings.llm_model_fast
    return "mock-rules"


_TOKEN = re.compile(r"[a-z]{3,}")


def _mock_embed(text: str) -> list[float]:
    vec = [0.0] * settings.embedding_dim
    for tok in _TOKEN.findall(text.lower()):
        idx = int(hashlib.md5(tok.encode()).hexdigest(), 16) % settings.embedding_dim
        vec[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _normalize(vec: list[float]) -> list[float]:
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(texts: list[str], kind: str = "document") -> list[list[float]]:
    """Embed texts. kind is "document" (policy chunks) or "query" (search text)."""
    if settings.provider == "gemini":
        from langchain_google_genai import GoogleGenerativeAIEmbeddings

        client = GoogleGenerativeAIEmbeddings(
            model=settings.gemini_embedding_model, google_api_key=settings.google_api_key
        )
        vectors = client.embed_documents(
            texts,
            task_type="RETRIEVAL_QUERY" if kind == "query" else "RETRIEVAL_DOCUMENT",
            output_dimensionality=settings.embedding_dim,
        )
        # Truncated (non-3072) Gemini embeddings should be re-normalized for cosine search.
        return [_normalize(list(v)) for v in vectors]
    if settings.provider == "openai":
        from langchain_openai import OpenAIEmbeddings

        client = OpenAIEmbeddings(
            model=settings.embedding_model, api_key=settings.openai_api_key, dimensions=settings.embedding_dim
        )
        return client.embed_documents(texts)
    return [_mock_embed(t) for t in texts]
