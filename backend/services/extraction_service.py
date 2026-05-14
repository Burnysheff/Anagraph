import json
import re
from pathlib import Path

from settings import settings
from models.entity_type import EntityType
from models.triplet import Triplet, ExtractionResult
from services.entity_type_service import OTHER_TYPE_NAME, get_default_types
from services.llm_client import LLMClient

PROMPTS_DIR = Path(__file__).parent.parent / "prompts"

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?…])\s+")
_CONTEXT_MAX_LEN = 400


def _find_context(chunk_text: str, subject: str, obj: str) -> str:
    sentences = [s.strip() for s in _SENTENCE_SPLIT.split(chunk_text) if s.strip()]
    s_lower = subject.lower()
    o_lower = obj.lower()
    for sent in sentences:
        sl = sent.lower()
        if s_lower in sl and o_lower in sl:
            return sent[:_CONTEXT_MAX_LEN]
    for sent in sentences:
        sl = sent.lower()
        if s_lower in sl or o_lower in sl:
            return sent[:_CONTEXT_MAX_LEN]
    return ""


def _ensure_other(types: list[EntityType]) -> list[EntityType]:
    if any(t.name == OTHER_TYPE_NAME for t in types):
        return list(types)
    other = next((t for t in get_default_types() if t.name == OTHER_TYPE_NAME), None)
    return list(types) + ([other] if other else [])


def _build_definitions(types: list[EntityType]) -> str:
    lines = []
    for t in types:
        desc = t.description.strip() if t.description else ""
        lines.append(f"- {t.name} — {desc}" if desc else f"- {t.name}")
    return "\n".join(lines)


def _pick_example_type(types: list[EntityType]) -> str:
    for t in types:
        if t.name != OTHER_TYPE_NAME:
            return t.name
    return OTHER_TYPE_NAME


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
        entity_types: list[EntityType] | None = None,
    ) -> ExtractionResult:
        types = _ensure_other(entity_types if entity_types else get_default_types())
        allowed_names = {t.name for t in types}

        types_str = ", ".join(t.name for t in types)
        type_definitions = _build_definitions(types)
        example_type = _pick_example_type(types)

        template = self.prompt_ru if language == "ru" else self.prompt_en
        prompt = (
            template
            .replace("{text}", chunk_text)
            .replace("{entity_types}", types_str)
            .replace("{type_definitions}", type_definitions)
            .replace("{example_type}", example_type)
        )

        for attempt in range(settings.max_retries):
            try:
                raw_response = await self.llm.generate(
                    prompt=prompt,
                    temperature=settings.extraction_temperature,
                    response_format="json",
                )

                data = json.loads(raw_response)
                triplets = []
                for t in data.get("triplets", []):
                    if not (t.get("subject") and t.get("predicate") and t.get("object")):
                        continue
                    subj = t["subject"].strip()
                    obj = t["object"].strip()
                    subj_type = (t.get("subject_type") or OTHER_TYPE_NAME).strip()
                    obj_type = (t.get("object_type") or OTHER_TYPE_NAME).strip()
                    if subj_type not in allowed_names:
                        subj_type = OTHER_TYPE_NAME
                    if obj_type not in allowed_names:
                        obj_type = OTHER_TYPE_NAME
                    triplets.append(
                        Triplet(
                            subject=subj,
                            subject_type=subj_type,
                            predicate=t["predicate"].strip(),
                            object=obj,
                            object_type=obj_type,
                            context=_find_context(chunk_text, subj, obj),
                        )
                    )

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
