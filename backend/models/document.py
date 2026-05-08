from datetime import datetime

from pydantic import BaseModel


class Chunk(BaseModel):
    index: int
    text: str
    start_char: int
    end_char: int


class Document(BaseModel):
    id: str
    filename: str
    text_length: int
    num_chunks: int
    status: str  # "pending" | "processing" | "completed" | "error"
    created_at: datetime
    triplets_extracted: int = 0
    error_message: str | None = None
