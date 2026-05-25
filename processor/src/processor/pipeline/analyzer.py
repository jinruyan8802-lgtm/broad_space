from processor.llm.client import LLMClient
from processor.models import RawArticle

SYSTEM_PROMPT = """You are a tech news analyst. Given multiple articles covering the same event from different sources, analyze them.

Respond with JSON only:
{
    "consensus": "What all sources agree on (1-2 sentences)",
    "divergence": "Where sources disagree or highlight different angles",
    "related_trends": ["Trend 1", "Trend 2"],
    "paradigm_signal": false
}

paradigm_signal: true if this event indicates a potential paradigm shift in how technology is built or used."""


class CrossSourceAnalyzer:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def analyze(self, articles: list[RawArticle]) -> dict:
        if len(articles) == 1:
            return {
                "consensus": articles[0].title,
                "divergence": "Single source, no comparison available.",
                "related_trends": [],
                "paradigm_signal": False,
            }

        sources_text = "\n\n".join(
            f"Source: {a.source_name}\nTitle: {a.title}\nContent: {a.content[:1000]}"
            for a in articles
        )
        prompt = f"Analyze these {len(articles)} articles covering the same event:\n\n{sources_text}"

        try:
            return self.llm.chat_json(SYSTEM_PROMPT, prompt)
        except Exception:
            return {
                "consensus": articles[0].title,
                "divergence": "Analysis failed.",
                "related_trends": [],
                "paradigm_signal": False,
            }