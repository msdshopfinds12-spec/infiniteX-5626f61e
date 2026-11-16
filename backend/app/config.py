"""Environment-backed backend configuration."""
from functools import lru_cache
from uuid import UUID

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="INFINITEGX_", env_file=".env", extra="ignore"
    )

    app_name: str = "INFINITEGX.7 API"
    environment: str = "development"
    jwt_jwks_url: str | None = None
    jwt_issuer: str | None = None
    jwt_audience: str | None = None
    owner_subject: str | None = None
    owner_tenant_id: UUID | None = None
    database_url: SecretStr = SecretStr(
        "postgresql+psycopg://infinitegx7:local-dev-only-change-me@localhost:5432/infinitegx7"
    )


@lru_cache
def get_settings() -> Settings:
    return Settings()
