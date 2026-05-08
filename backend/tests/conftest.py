import pytest


class MockLLMClient:

    def __init__(self, response: str = '{"triplets": []}'):
        self.response = response
        self.calls: list[dict] = []

    async def generate(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        response_format: str = "json",
    ) -> str:
        self.calls.append({
            "prompt": prompt,
            "system": system,
            "temperature": temperature,
        })
        return self.response

    async def close(self) -> None:
        pass


@pytest.fixture
def mock_llm():
    return MockLLMClient()


@pytest.fixture
def mock_llm_with_triplets():
    return MockLLMClient(
        response='{"triplets": [{"subject": "Google", "subject_type": "Organization", '
        '"predicate": "developed", "object": "BERT", "object_type": "Technology"}]}'
    )
