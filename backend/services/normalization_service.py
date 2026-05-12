import json
from difflib import SequenceMatcher
from pathlib import Path

from settings import settings
from models.triplet import Triplet

ALIASES_PATH = Path(__file__).parent.parent / "config" / "aliases.json"


class NormalizationService:

    def __init__(self):
        data = json.loads(ALIASES_PATH.read_text())
        self.entity_aliases: dict[str, str] = data.get("entity_aliases", {})
        self.predicate_aliases: dict[str, str] = data.get("predicate_aliases", {})

    def normalize_triplets(self, triplets: list[Triplet]) -> list[Triplet]:
        triplets = [self._normalize_entity_names(t) for t in triplets]
        triplets = [self._normalize_predicate(t) for t in triplets]
        triplets = self._deduplicate(triplets)
        triplets = self._merge_similar_entities(triplets)
        return triplets

    def _normalize_entity_names(self, triplet: Triplet) -> Triplet:
        subject = self.entity_aliases.get(triplet.subject.lower(), triplet.subject).strip()
        obj = self.entity_aliases.get(triplet.object.lower(), triplet.object).strip()
        return triplet.model_copy(update={"subject": subject, "object": obj})

    def _normalize_predicate(self, triplet: Triplet) -> Triplet:
        pred = triplet.predicate.lower().strip()
        normalized = self.predicate_aliases.get(pred, pred)
        return triplet.model_copy(update={"predicate": normalized})

    @staticmethod
    def _deduplicate(triplets: list[Triplet]) -> list[Triplet]:
        seen: set[tuple[str, str, str]] = set()
        unique: list[Triplet] = []
        for t in triplets:
            key = (t.subject.lower(), t.predicate.lower(), t.object.lower())
            if key not in seen:
                seen.add(key)
                unique.append(t)
        return unique

    def _merge_similar_entities(self, triplets: list[Triplet]) -> list[Triplet]:
        entity_types: dict[str, str] = {}
        all_names: set[str] = set()
        for t in triplets:
            all_names.add(t.subject)
            all_names.add(t.object)
            entity_types[t.subject.lower()] = t.subject_type
            entity_types[t.object.lower()] = t.object_type

        canonical: dict[str, str] = {}
        sorted_names = sorted(all_names)

        for i, name1 in enumerate(sorted_names):
            if name1 in canonical:
                continue
            canonical[name1] = name1
            for name2 in sorted_names[i + 1:]:
                if name2 in canonical:
                    continue

                if self._should_merge(name1, name2, entity_types):
                    canon = name1 if len(name1) >= len(name2) else name2
                    canonical[name1] = canon
                    canonical[name2] = canon

        result = [
            t.model_copy(update={
                "subject": canonical.get(t.subject, t.subject),
                "object": canonical.get(t.object, t.object),
            })
            for t in triplets
        ]

        return self._deduplicate(result)

    @staticmethod
    def _should_merge(name1: str, name2: str, entity_types: dict[str, str]) -> bool:
        similarity = SequenceMatcher(
            None, name1.lower(), name2.lower()
        ).ratio()
        if similarity >= settings.similarity_threshold:
            return True

        type1 = entity_types.get(name1.lower(), "")
        type2 = entity_types.get(name2.lower(), "")
        if type1 == type2 == "Organization":
            words1 = name1.lower().split()
            words2 = name2.lower().split()
            if words1 and words2 and words1[0] == words2[0] and len(words1[0]) >= 3:
                return True

        return False
