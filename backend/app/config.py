"""Application settings, read from environment variables or a .env file."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://triage:triage@localhost:5432/triage"

    # LLM provider: "gemini", "openai", or "auto" (uses whichever key is set,
    # Gemini first). With no key for the chosen provider the app runs in MOCK
    # mode: keyword rules stand in for the LLM, at no API cost.
    llm_provider: str = "auto"

    # Google Gemini
    google_api_key: str = ""
    gemini_model_fast: str = "gemini-3.5-flash-lite"   # classification
    gemini_model_strong: str = "gemini-3.8-flash"      # response drafting
    gemini_embedding_model: str = "gemini-embedding-001"
    # How long Gemini "thinks" before answering: minimal | low | medium | high, or empty
    # for the model default. "low" keeps drafting fast (the default took ~40s per draft).
    gemini_reasoning_effort: str = "low"
    gemini_max_output_tokens: int = 2048  # includes thinking tokens

    # OpenAI
    openai_api_key: str = ""
    llm_model_fast: str = "gpt-4o-mini"
    llm_model_strong: str = "gpt-4o"
    embedding_model: str = "text-embedding-3-small"

    # Vector size stored in pgvector. Both providers are asked for 1536 dimensions,
    # so switching provider only needs `python -m scripts.ingest_policies`, not a schema change.
    embedding_dim: int = 1536

    cors_origins: str = "http://localhost:3000"
    response_deadline_days: int = 15   # CFPB: company response expected within 15 days
    rag_top_k: int = 3

    @property
    def provider(self) -> str:
        """The provider actually in use: gemini, openai, or mock."""
        p = self.llm_provider.lower()
        if p == "gemini":
            return "gemini" if self.google_api_key else "mock"
        if p == "openai":
            return "openai" if self.openai_api_key else "mock"
        if self.google_api_key:
            return "gemini"
        if self.openai_api_key:
            return "openai"
        return "mock"

    @property
    def mock_llm(self) -> bool:
        return self.provider == "mock"

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")


@lru_cache
def get_settings() -> Settings:
    return Settings()
