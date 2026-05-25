from unittest.mock import MagicMock
from processor.knowledge.extractor import TripleExtractor
from processor.models import ProcessedContent

def test_extract_returns_triples():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {
        "triples": [
            {"subject": "Rust", "predicate": "evolves_from", "object": "C++", "confidence": "EXTRACTED"}
        ]
    }
    extractor = TripleExtractor(mock_llm)
    content = ProcessedContent(id="t1", title="Rust 2.0", url="https://rust-lang.org", summary="Rust evolves from C++", key_points=["Rust is a modern language"])
    result = extractor.extract(content)
    assert len(result) == 1
    assert result[0]["subject"] == "Rust"
    assert result[0]["object"] == "C++"

def test_extract_handles_llm_failure():
    mock_llm = MagicMock()
    mock_llm.chat_json.side_effect = Exception("LLM error")
    extractor = TripleExtractor(mock_llm)
    content = ProcessedContent(id="t2", title="Test", url="https://test.com")
    result = extractor.extract(content)
    assert result == []