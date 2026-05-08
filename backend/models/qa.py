from pydantic import BaseModel


class QARequest(BaseModel):
    question: str
    language: str = "auto"


class QAResponse(BaseModel):
    answer: str
    cypher_query: str
    raw_results: list[dict]
    method: str  # "text_to_cypher" | "fallback" | "error"
