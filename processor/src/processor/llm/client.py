import json
import os
from typing import Any

from anthropic import Anthropic


class LLMClient:
    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        base_url: str | None = None,
    ):
        self.base_url = base_url or os.environ.get("LLM_BASE_URL", "")
        self.api_key = api_key or os.environ.get("LLM_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")
        self.model = model or os.environ.get("LLM_MODEL", "claude-sonnet-4-6")

        # Use OpenAI-compatible client for local LM Studio / OpenRouter
        if self.base_url:
            try:
                from openai import OpenAI
                self.client = OpenAI(base_url=self.base_url.rstrip("/") + "/v1", api_key=self.api_key or "sk-null")
                self._provider = "openai"
            except ImportError:
                raise RuntimeError("openai package required for custom LLM_BASE_URL: pip install openai")
        else:
            self.client = Anthropic(api_key=self.api_key)
            self._provider = "anthropic"

    def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> str:
        if self._provider == "openai":
            response = self.client.chat.completions.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            return response.choices[0].message.content
        else:
            response = self.client.messages.create(
                model=self.model,
                max_tokens=max_tokens,
                temperature=temperature,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )
            return response.content[0].text

    def chat_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> dict[str, Any]:
        text = self.chat(system_prompt, user_prompt, temperature, max_tokens)
        return self._extract_json(text)

    def _extract_json(self, text: str) -> dict[str, Any]:
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        return json.loads(text.strip())
