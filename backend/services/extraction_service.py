import json
from pathlib import Path

from config import settings
from models.triplet import Triplet, ExtractionResult
from services.llm_client import LLMClient

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"


class ExtractionService:

    def __init__(self, llm: LLMClient):
        self.llm = llm
        self.prompt_ru = (PROMPTS_DIR / "extraction_ru.txt").read_text()
        self.prompt_en = (PROMPTS_DIR / "extraction_en.txt").read_text()

    async def extract_from_chunk(
        self,
        chunk_text: str,
        chunk_index: int,
        total_chunks: int,
        language: str = "ru",
        entity_types: list[str] | None = None,
    ) -> ExtractionResult:
        types = entity_types or settings.default_entity_types
        types_str = ", ".join(types)

        template = self.prompt_ru if language == "ru" else self.prompt_en
        prompt = template.replace("{text}", chunk_text).replace("{entity_types}", types_str)

        for attempt in range(settings.max_retries):
            try:
                raw_response = await self.llm.generate(
                    prompt=prompt,
                    temperature=settings.extraction_temperature,
                    response_format="json",
                )

                data = json.loads(raw_response)
                triplets = [
                    Triplet(
                        subject=t["subject"].strip(),
                        subject_type=t.get("subject_type", "Concept"),
                        predicate=t["predicate"].strip(),
                        object=t["object"].strip(),
                        object_type=t.get("object_type", "Concept"),
                        context=chunk_text[:200],
                    )
                    for t in data.get("triplets", [])
                    if t.get("subject") and t.get("predicate") and t.get("object")
                ]

                return ExtractionResult(
                    triplets=triplets,
                    chunk_index=chunk_index,
                    total_chunks=total_chunks,
                    raw_text=chunk_text,
                )

            except (json.JSONDecodeError, KeyError):
                if attempt == settings.max_retries - 1:
                    return ExtractionResult(
                        triplets=[],
                        chunk_index=chunk_index,
                        total_chunks=total_chunks,
                        raw_text=chunk_text,
                    )
                continue
