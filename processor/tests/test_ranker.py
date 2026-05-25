from processor.models import ProcessedContent
from processor.pipeline.ranker import Ranker, DEFAULT_CATEGORIES


def test_rank_orders_by_signal_and_interest():
    ranker = Ranker(user_categories=["AI/ML"])
    contents = [
        ProcessedContent(id="a", title="AI News", categories=["AI/ML"], signal_strength=0.9),
        ProcessedContent(id="b", title="Rust Update", categories=["Programming Languages"], signal_strength=0.5),
        ProcessedContent(id="c", title="AI Breakthrough", categories=["AI/ML"], signal_strength=0.95),
    ]
    ranked = ranker.rank(contents)
    assert ranked[0].id == "c"
    assert ranked[1].id == "a"


def test_exploit_score():
    ranker = Ranker(user_categories=["AI/ML", "Security"])
    content = ProcessedContent(id="x", title="Security AI", categories=["AI/ML", "Security"], signal_strength=1.0)
    scores = ranker.score(content)
    assert scores["exploit"] == 1.0  # full overlap with 2 categories


def test_explore_score_novelty():
    ranker = Ranker(user_categories=["AI/ML"])
    c1 = ProcessedContent(id="c1", title="Security vuln", categories=["Security"], signal_strength=0.8)
    s1 = ranker.score(c1)
    # First time seeing Security category, so novel
    assert s1["explore"] > 0

    c2 = ProcessedContent(id="c2", title="Security patch", categories=["Security"], signal_strength=0.8)
    s2 = ranker.score(c2)
    # Second time seeing Security, no novelty
    assert s2["explore"] == 0


def test_default_categories_available():
    assert len(DEFAULT_CATEGORIES) > 0
    assert "AI/ML" in DEFAULT_CATEGORIES