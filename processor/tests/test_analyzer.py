from unittest.mock import MagicMock

from processor.models import RawArticle
from processor.pipeline.analyzer import CrossSourceAnalyzer


def test_analyze_multiple_sources():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {
        "consensus": "All agree this is significant.",
        "divergence": "Differ on timeline estimates.",
        "related_trends": ["AI adoption"],
        "paradigm_signal": True,
    }

    analyzer = CrossSourceAnalyzer(mock_llm)
    articles = [
        RawArticle(id="a1", title="X Announced", url="https://a.com", source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z", content="content a"),
        RawArticle(id="a2", title="X Revealed", url="https://b.com", source_name="Reddit", hash="h2", fetched_at="2026-05-25T08:00:00Z", content="content b"),
    ]

    result = analyzer.analyze(articles)

    assert result["paradigm_signal"] is True
    assert "AI adoption" in result["related_trends"]


def test_analyze_single_source_fallback():
    analyzer = CrossSourceAnalyzer(MagicMock())
    articles = [
        RawArticle(id="a1", title="X Announced", url="https://a.com", source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z", content="content"),
    ]

    result = analyzer.analyze(articles)

    assert result["consensus"] == "X Announced"
    assert result["paradigm_signal"] is False