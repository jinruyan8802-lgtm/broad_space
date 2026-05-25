from processor.llm.client import LLMClient
from processor.models import ProcessedContent

SYSTEM_PROMPT = """Extract knowledge triples from the tech news article.

Rules:
- Entity types: Technology, Event, Organization, Person, Concept, Trend, Paper
- Relation types: depends_on, drives, competes_with, created_by, implements, evolves_from, replaces, published_in, related_to
- Confidence: EXTRACTED (directly stated), INFERRED (reasonable inference), SPECULATIVE (weak signal)

Respond with JSON only:
{
    "triples": [
        {"subject": "...", "predicate": "...", "object": "...", "confidence": "EXTRACTED"}
    ]
}"""


class TripleExtractor:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def extract(self, content: ProcessedContent) -> list[dict]:
        prompt = f"Title: {content.title}\nSummary: {content.summary}\nKey points: {content.key_points}"
        try:
            result = self.llm.chat_json(SYSTEM_PROMPT, prompt)
            triples = result.get("triples", [])
            for t in triples:
                t.setdefault("confidence", "EXTRACTED")
            return triples
        except Exception:
            return []