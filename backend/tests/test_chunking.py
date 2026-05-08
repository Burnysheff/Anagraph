from services.chunking_service import ChunkingService


def test_single_chunk_for_short_text():
    service = ChunkingService(chunk_size=100, overlap=20)
    text = "This is a short text."
    chunks = service.split(text)
    assert len(chunks) == 1
    assert chunks[0].text == text
    assert chunks[0].index == 0


def test_multiple_chunks():
    service = ChunkingService(chunk_size=50, overlap=10)
    text = "First sentence here. " * 20
    chunks = service.split(text.strip())
    assert len(chunks) > 1


def test_chunk_size_respected():
    service = ChunkingService(chunk_size=100, overlap=20)
    text = "Sentence one is here. " * 50
    chunks = service.split(text.strip())
    for c in chunks:
        assert len(c.text) // 4 <= 120  # with margin


def test_chunk_indices_sequential():
    service = ChunkingService(chunk_size=50, overlap=10)
    text = "Some sentence. " * 30
    chunks = service.split(text.strip())
    for i, c in enumerate(chunks):
        assert c.index == i


def test_empty_text():
    service = ChunkingService(chunk_size=100, overlap=20)
    chunks = service.split("")
    assert len(chunks) == 0
