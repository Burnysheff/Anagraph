from pydantic import BaseModel


class Triplet(BaseModel):
    subject: str
    subject_type: str = "Concept"
    predicate: str
    object: str
    object_type: str = "Concept"
    context: str = ""
    confidence: float = 1.0


class ExtractionResult(BaseModel):
    triplets: list[Triplet]
    chunk_index: int
    total_chunks: int
    raw_text: str
