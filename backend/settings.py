import json
from pathlib import Path
from typing import Annotated

from pydantic import field_validator
from pydantic_settings import BaseSettings, NoDecode


class Settings(BaseSettings):
    neo4j_uri: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "changeme"

    llm_provider: str = "groq"  # "groq" | "ollama"

    groq_api_key: str = ""
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_model: str = "llama-3.3-70b-versatile"

    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.1:8b"

    chunk_size: int = 1200
    chunk_overlap: int = 150
    max_retries: int = 3
    extraction_temperature: float = 0.1

    qa_temperature: float = 0.0
    qa_max_tokens: int = 1024
    cypher_fallback_enabled: bool = True

    similarity_threshold: float = 0.85

    database_path: str = "data/anagraph.db"

    allowed_origins: Annotated[list[str], NoDecode] = ["http://localhost:3000"]

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _parse_allowed_origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return ["*"]
            if v.startswith("["):
                return json.loads(v)
            return [item.strip() for item in v.split(",") if item.strip()]
        return v

    class Config:
        env_file = Path(__file__).resolve().parent.parent / ".env"
        extra = "ignore"


settings = Settings()
