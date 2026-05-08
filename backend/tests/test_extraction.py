import pytest
from services.extraction_service import ExtractionService
from tests.conftest import MockLLMClient


@pytest.mark.asyncio
async def test_extraction_parses_json():
    llm = MockLLMClient(
        response='{"triplets": [{"subject": "A", "predicate": "rel", "object": "B"}]}'
    )
    service = ExtractionService(llm)
    result = await service.extract_from_chunk("Test text", 0, 1)
    assert len(result.triplets) == 1
    assert result.triplets[0].subject == "A"
    assert result.triplets[0].predicate == "rel"
    assert result.triplets[0].object == "B"


@pytest.mark.asyncio
async def test_extraction_with_types():
    llm = MockLLMClient(
        response='{"triplets": [{"subject": "Google", "subject_type": "Organization", '
        '"predicate": "developed", "object": "BERT", "object_type": "Technology"}]}'
    )
    service = ExtractionService(llm)
    result = await service.extract_from_chunk("Google developed BERT", 0, 1)
    assert result.triplets[0].subject_type == "Organization"
    assert result.triplets[0].object_type == "Technology"


@pytest.mark.asyncio
async def test_extraction_handles_bad_json():
    llm = MockLLMClient(response="not valid json")
    service = ExtractionService(llm)
    result = await service.extract_from_chunk("Test", 0, 1)
    assert len(result.triplets) == 0


@pytest.mark.asyncio
async def test_extraction_empty_triplets():
    llm = MockLLMClient(response='{"triplets": []}')
    service = ExtractionService(llm)
    result = await service.extract_from_chunk("Test", 0, 1)
    assert len(result.triplets) == 0


@pytest.mark.asyncio
async def test_extraction_skips_incomplete_triplets():
    llm = MockLLMClient(
        response='{"triplets": [{"subject": "A", "predicate": "", "object": "B"}, '
        '{"subject": "C", "predicate": "rel", "object": "D"}]}'
    )
    service = ExtractionService(llm)
    result = await service.extract_from_chunk("Test", 0, 1)
    assert len(result.triplets) == 1
    assert result.triplets[0].subject == "C"
