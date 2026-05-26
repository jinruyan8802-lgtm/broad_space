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

def _fake_llm_missing_zh():
    class FakeLLM:
        def chat_json(self, system, prompt):
            return {
                "triples": [
                    {
                        "subject": "PyTorch",
                        "predicate": "drives",
                        "object": "AI Research",
                        "confidence": "EXTRACTED"
                    }
                ]
            }
    return FakeLLM()

def _fake_llm_raises():
    class FakeLLM:
        def chat_json(self, system, prompt):
            raise RuntimeError("LLM unavailable")
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
    assert t["object"] == "AI Research"
    assert t["object_zh"] == "人工智能研究"
    assert t["confidence"] == "EXTRACTED"

def test_extract_missing_zh_fields_fallback_to_english():
    extractor = TripleExtractor(_fake_llm_missing_zh())
    content = ProcessedContent(
        id="test2",
        title="Test",
        summary="Test summary",
        key_points=["point"],
        categories=["Test"],
        signal_strength=0.5,
    )
    result = extractor.extract(content)
    assert len(result) == 1
    t = result[0]
    assert t["subject_zh"] == t["subject"]
    assert t["object_zh"] == t["object"]
    assert t["predicate_zh"] == "驱动"

def test_extract_llm_raises_returns_empty_list(caplog):
    extractor = TripleExtractor(_fake_llm_raises())
    content = ProcessedContent(
        id="test3",
        title="Test",
        summary="Test summary",
        key_points=["point"],
        categories=["Test"],
        signal_strength=0.5,
    )
    result = extractor.extract(content)
    assert result == []
    assert "Triple extraction failed" in caplog.text