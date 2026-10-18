"""Application settings, read from environment variables or a .env file."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://triage:triage@localhost:5432/triage"

    # LLM settings. With no OPENAI_API_KEY the app runs in MOCK mode:
    # deterministic keyword rules stand in for the LLM so the UI and
    # pipeline can be demoed and tested without spending API credits.
    openai_api_key: str = ""
    llm_model_fast: str = "gpt-4o-mini"   # classification / routing
    llm_model_strong: str = "gpt-4o"      # response drafting
    embedding_model: str = "text-embedding-3-small"
    embedding_dim: int = 1536

    cors_origins: str = "http://localhost:3000"
    response_deadline_days: int = 15   # CFPB: company response expected within 15 days
    rag_top_k: int = 3

    @property
    def mock_llm(self) -> bool:
        return not self.openai_api_key

    @property
    def is_postgres(self) -> bool:
        return self.database_url.startswith("postgresql")


@lru_cache
def get_settings() -> Settings:
    return Settings()
