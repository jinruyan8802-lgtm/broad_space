from processor.llm.client import LLMClient
from processor.models import RawArticle

SYSTEM_PROMPT = """You are a tech news summarizer. Given an article, produce a structured summary.

Respond with JSON only:
{
    "summary": "One-sentence overview of the article (max 50 words)",
    "key_points": ["Point 1", "Point 2", "Point 3"],
    "signal_strength": 0.85,
    "sentiment": "positive|neutral|cautious"
}

signal_strength (0.0-1.0): How significant this news is for the tech industry. Breakthrough = 0.9+, Routine update = 0.3-."""


class Summarizer:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def summarize(self, article: RawArticle) -> dict:
        prompt = f"Title: {article.title}\nContent: {article.content[:3000]}\n\nSummarize this article."
        try:
            return self.llm.chat_json(SYSTEM_PROMPT, prompt)
        except Exception:
            return {
                "summary": article.title,
                "key_points": [],
                "signal_strength": 0.5,
                "sentiment": "neutral",
            }