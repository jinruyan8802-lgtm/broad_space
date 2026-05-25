from unittest.mock import MagicMock

from processor.models import RawArticle
from processor.pipeline.summarizer import Summarizer


def test_summarize_returns_structured_result():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {
        "summary": "A new framework for AI agents.",
        "key_points": ["Point 1", "Point 2"],
        "signal_strength": 0.9,
        "sentiment": "positive",
    }

    summarizer = Summarizer(mock_llm)
    article = RawArticle(
        id="a1", title="AI Agent Framework", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = summarizer.summarize(article)

    assert result["summary"] == "A new framework for AI agents."
    assert result["signal_strength"] == 0.9


def test_summarize_fallback_on_error():
    mock_llm = MagicMock()
    mock_llm.chat_json.side_effect = Exception("LLM error")

    summarizer = Summarizer(mock_llm)
    article = RawArticle(
        id="a1", title="AI Agent Framework", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = summarizer.summarize(article)

    assert result["summary"] == "AI Agent Framework"
    assert result["signal_strength"] == 0.5