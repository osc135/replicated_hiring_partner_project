from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/supportbundle"
    OPENAI_API_KEY: str = ""
    SECRET_KEY: str = "change-me-in-production"
    LANGFUSE_PUBLIC_KEY: Optional[str] = None
    LANGFUSE_SECRET_KEY: Optional[str] = None
    LANGFUSE_HOST: str = "https://cloud.langfuse.com"

    @property
    def asyncpg_url(self) -> str:
        """Convert the DATABASE_URL to a plain asyncpg-compatible URL."""
        url = self.DATABASE_URL
        if url.startswith("postgresql+asyncpg://"):
            url = url.replace("postgresql+asyncpg://", "postgresql://", 1)
        return url

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()
