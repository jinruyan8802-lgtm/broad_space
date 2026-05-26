import pytest
from processor.knowledge.extractor import TripleExtractor
from processor.models import ProcessedContent

def _fake_llm():
    class FakeLLM:
        def chat_json(self, system, prompt):
            return {
                "triples": [
                    {
                        "subject": "PyTorch",
                        "predicate": "drives",
                        "object": "AI Research",
                        "subject_zh": "PyTorch",
                        "predicate_zh": "驱动",
                        "object_zh": "人工智能研究",
                        "confidence": "EXTRACTED"
                    }
                ]
            }
    return FakeLLM()

def test_extract_returns_bilingual_triples():
    extractor = TripleExtractor(_fake_llm())
    content = ProcessedContent(
        id="test1",
        title="PyTorch 2.0 released",
        summary="PyTorch drives AI research",
        key_points=["PyTorch 2.0"],
        categories=["AI/ML"],
        signal_strength=0.8,
    )
    result = extractor.extract(content)
    assert len(result) == 1
    t = result[0]
    assert t["subject"] == "PyTorch"
    assert t["subject_zh"] == "PyTorch"
    assert t["predicate"] == "drives"
    assert t["predicate_zh"] == "驱动"
    assert t["confidence"] == "EXTRACTED"