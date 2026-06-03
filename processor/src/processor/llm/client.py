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
        self.api_key = (
            api_key
            or os.environ.get("LLM_API_KEY")
            or os.environ.get("ANTHROPIC_API_KEY")
            or os.environ.get("ANTHROPIC_AUTH_TOKEN")
        )
        self.model = (
            model
            or os.environ.get("LLM_MODEL")
            or os.environ.get("ANTHROPIC_MODEL")
            or "claude-sonnet-4-6"
        )

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
            # Handle Claude extended thinking (ThinkingBlock) — skip thinking blocks
            for block in response.content:
                if hasattr(block, "text") and block.text:
                    return block.text
            return ""

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

        # Strip <think>...</think> blocks from reasoning models (DeepSeek R1, Qwen, etc.)
        if "</think>" in text:
            text = text.split("</think>")[-1].strip()

        # Strip markdown code fences
        if text.startswith("```"):
            first_nl = text.find("\n")
            if first_nl != -1:
                text = text[first_nl + 1 :]
            else:
                text = text[3:]
        if text.endswith("```"):
            text = text[:-3].strip()

        text = text.strip()

        # Use raw_decode to extract the first JSON object, ignoring trailing text.
        # Handles LLMs that emit JSON followed by explanations or multiple objects.
        decoder = json.JSONDecoder()
        obj, idx = decoder.raw_decode(text)
        return obj
