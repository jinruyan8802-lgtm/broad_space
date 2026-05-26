import logging

from processor.llm.client import LLMClient
from processor.models import ProcessedContent

logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """Extract knowledge triples from the tech news article (supports both English and Chinese content).

Entity types + Chinese equivalents:
- Technology → 技术, Event → 事件, Organization → 组织, Person → 人物
- Concept → 概念, Trend → 趋势, Paper → 论文

Relation types + Chinese equivalents:
- depends_on → 依赖于, drives → 驱动, competes_with → 竞争于
- created_by → 创建者, implements → 实现, evolves_from → 演进自
- replaces → 取代, published_in → 发布于, related_to → 相关于

Rules:
- Confidence: EXTRACTED (directly stated), INFERRED (reasonable inference), SPECULATIVE (weak signal)

Respond with JSON only:
{
    "triples": [
        {
            "subject": "...",
            "subject_zh": "...",
            "predicate": "...",
            "predicate_zh": "...",
            "object": "...",
            "object_zh": "...",
            "confidence": "EXTRACTED|INFERRED|SPECULATIVE"
        }
    ]
}"""

PREDICATE_ZH_MAP = {
    "depends_on": "依赖于",
    "drives": "驱动",
    "competes_with": "竞争于",
    "created_by": "创建者",
    "implements": "实现",
    "evolves_from": "演进自",
    "replaces": "取代",
    "published_in": "发布于",
    "related_to": "相关于",
}

ENTITY_ZH_MAP = {
    "Technology": "技术",
    "Event": "事件",
    "Organization": "组织",
    "Person": "人物",
    "Concept": "概念",
    "Trend": "趋势",
    "Paper": "论文",
}


class TripleExtractor:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def extract(self, content: ProcessedContent) -> list[dict]:
        prompt = f"Title: {content.title}\nSummary: {content.summary}\nKey points: {content.key_points}"
        try:
            result = self.llm.chat_json(SYSTEM_PROMPT, prompt)
            triples = result.get("triples", [])
            enriched = []
            for t in triples:
                t.setdefault("confidence", "EXTRACTED")
                t.setdefault("subject_zh", t["subject"])
                t.setdefault("predicate_zh", PREDICATE_ZH_MAP.get(t["predicate"], t["predicate"]))
                t.setdefault("object_zh", t["object"])
                enriched.append(t)
            return enriched
        except Exception as e:
            logger.warning("Triple extraction failed: %s", e)
            return []