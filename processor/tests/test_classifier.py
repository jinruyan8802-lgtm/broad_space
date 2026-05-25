from unittest.mock import MagicMock

from processor.models import RawArticle
from processor.pipeline.classifier import Classifier


def test_classify_returns_valid_categories():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {"categories": ["AI/ML", "Infrastructure"], "confidence": 0.9}

    classifier = Classifier(mock_llm)
    article = RawArticle(
        id="a1", title="Test", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = classifier.classify(article)

    assert "AI/ML" in result
    assert "Infrastructure" in result


def test_classify_fallback_on_invalid_categories():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {"categories": ["FakeCategory"], "confidence": 0.5}

    classifier = Classifier(mock_llm)
    article = RawArticle(
        id="a1", title="Test", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = classifier.classify(article)

    assert result == ["Other"]


def test_classify_fallback_on_error():
    mock_llm = MagicMock()
    mock_llm.chat_json.side_effect = Exception("LLM error")

    classifier = Classifier(mock_llm)
    article = RawArticle(
        id="a1", title="Test", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = classifier.classify(article)

    assert result == ["Other"]