"""LLM and embedding access.

Real mode: OpenAI via LangChain. Mock mode (no OPENAI_API_KEY): a deterministic
hashed bag-of-words embedding, and agents fall back to rule-based logic.
"""
import hashlib
import math
import re

from app.config import get_settings

settings = get_settings()


def get_chat(strong: bool = False):
    from langchain_openai import ChatOpenAI

    return ChatOpenAI(
        model=settings.llm_model_strong if strong else settings.llm_model_fast,
        api_key=settings.openai_api_key,
        temperature=0.2 if strong else 0,
    )


def model_name(strong: bool = False) -> str:
    if settings.mock_llm:
        return "mock-rules"
    return settings.llm_model_strong if strong else settings.llm_model_fast


_TOKEN = re.compile(r"[a-z]{3,}")


def _mock_embed(text: str) -> list[float]:
    vec = [0.0] * settings.embedding_dim
    for tok in _TOKEN.findall(text.lower()):
        idx = int(hashlib.md5(tok.encode()).hexdigest(), 16) % settings.embedding_dim
        vec[idx] += 1.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def embed(texts: list[str]) -> list[list[float]]:
    if settings.mock_llm:
        return [_mock_embed(t) for t in texts]
    from langchain_openai import OpenAIEmbeddings

    client = OpenAIEmbeddings(model=settings.embedding_model, api_key=settings.openai_api_key)
    return client.embed_documents(texts)
