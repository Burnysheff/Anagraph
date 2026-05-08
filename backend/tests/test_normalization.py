from models.triplet import Triplet
from services.normalization_service import NormalizationService


def make_triplet(subject: str, predicate: str, obj: str) -> Triplet:
    return Triplet(subject=subject, predicate=predicate, object=obj)


def test_alias_normalization():
    service = NormalizationService()
    triplet = make_triplet("вшэ", "находится_в", "Пермь")
    result = service._normalize_entity_names(triplet)
    assert result.subject == "НИУ ВШЭ"


def test_predicate_normalization():
    service = NormalizationService()
    triplet = make_triplet("Google", "создала", "BERT")
    result = service._normalize_predicate(triplet)
    assert result.predicate == "разработала"


def test_deduplication():
    service = NormalizationService()
    triplets = [
        make_triplet("Google", "developed", "BERT"),
        make_triplet("google", "developed", "BERT"),
    ]
    result = NormalizationService._deduplicate(triplets)
    assert len(result) == 1


def test_full_normalization():
    service = NormalizationService()
    triplets = [
        make_triplet("Google", "created", "BERT"),
        make_triplet("google", "developed", "BERT"),
    ]
    result = service.normalize_triplets(triplets)
    assert len(result) == 1


def test_similar_entity_merge():
    service = NormalizationService()
    triplets = [
        make_triplet("TensorFlow", "uses", "Python"),
        make_triplet("Tensorflow", "uses", "Python"),
    ]
    result = service.normalize_triplets(triplets)
    assert len(result) == 1
