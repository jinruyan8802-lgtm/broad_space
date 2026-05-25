from unittest.mock import patch, MagicMock

from processor.pipeline.dedup import SemanticDeduplicator, Deduplicator
from processor.models import RawArticle


def make_article(id_: str, title: str, content: str = "content here", source: str = "test") -> RawArticle:
    import hashlib
    h = hashlib.md5(f"{id_}{title}".encode()).hexdigest()
    return RawArticle(
        id=id_,
        title=title,
        url=f"https://{source}.com/{id_}",
        source_name=source,
        content=content,
        fetched_at="2026-05-25T08:00:00Z",
        hash=h,
    )


def test_deduplicator_no_embedding_load():
    """Deduplicator does not inherit SemanticDeduplicator (no embedding model on init)."""
    assert not issubclass(Deduplicator, SemanticDeduplicator)
    # Instantiation must be fast (no model download)
    import time
    t0 = time.perf_counter()
    dedup = Deduplicator()
    assert time.perf_counter() - t0 < 0.1  # Must be <100ms


@patch("processor.pipeline.dedup.FASTEMBED_AVAILABLE", False)
def test_fallback_when_fastembed_unavailable():
    """When FastEmbed is not installed, falls back to hash-only dedup."""
    dedup = SemanticDeduplicator()
    a1 = make_article("1", "Rust Roadmap", "content A", "hn")
    a2 = make_article("2", "Rust Roadmap", "content B", "reddit")
    # Different hash, so not duplicate when embeddings unavailable
    assert dedup.is_duplicate(a1) is False
    dedup.add(a1)
    assert dedup.is_duplicate(a2) is False


def test_group_by_event():
    """Group articles by source and title prefix."""
    dedup = SemanticDeduplicator()
    articles = [
        make_article("1", "Rust 2026 Roadmap Update AAA X", "content A", "hn"),
        make_article("2", "Rust 2026 Roadmap Update AAA XX", "content B", "hn"),  # Same first 30 chars
        make_article("3", "Go 1.24 Released and Cited", "content C", "hn"),
    ]
    groups = dedup.group_by_event(articles)
    # First two have identical first 30 chars -> grouped together
    assert len(groups) == 2
    # Find the group with 2 articles
    two_item_groups = [g for g in groups if len(g) == 2]
    assert len(two_item_groups) == 1
    assert two_item_groups[0][0].source_name == "hn"