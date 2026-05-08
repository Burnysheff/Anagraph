from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    neo4j_uri: str = "bolt://neo4j:7687"
    neo4j_user: str = "neo4j"
    neo4j_password: str = "changeme"

    groq_api_key: str = ""
    groq_model: str = "llama-3.3-70b-versatile"

    chunk_size: int = 1200
    chunk_overlap: int = 150
    max_retries: int = 3
    extraction_temperature: float = 0.1

    qa_temperature: float = 0.0
    qa_max_tokens: int = 1024
    cypher_fallback_enabled: bool = True

    default_entity_types: list[str] = [
        "Person", "Organization", "Technology", "Concept",
        "Location", "Date", "Event", "Product",
    ]

    similarity_threshold: float = 0.85

    class Config:
        env_file = ".env"


settings = Settings()
