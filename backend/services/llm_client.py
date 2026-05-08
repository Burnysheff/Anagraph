from typing import Protocol, runtime_checkable

from openai import AsyncOpenAI


@runtime_checkable
class LLMClient(Protocol):
    async def generate(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        response_format: str = "json",
    ) -> str: ...

    async def close(self) -> None: ...


class GroqLLMClient:
    def __init__(self, api_key: str, model: str = "llama-3.3-70b-versatile"):
        self.model = model
        self.client = AsyncOpenAI(
            api_key=api_key,
            base_url="https://api.groq.com/openai/v1",
        )

    async def generate(
        self,
        prompt: str,
        system: str = "",
        temperature: float = 0.1,
        max_tokens: int = 4096,
        response_format: str = "json",
    ) -> str:
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})

        kwargs: dict = {
            "model": self.model,
            "messages": messages,
            "temperature": temperature,
            "max_tokens": max_tokens,
        }
        if response_format == "json":
            kwargs["response_format"] = {"type": "json_object"}

        response = await self.client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""

    async def close(self) -> None:
        await self.client.close()
