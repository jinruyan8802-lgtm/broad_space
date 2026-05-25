import pytest

from processor.models import RawArticle
from processor.pipeline.dedup import Deduplicator


@pytest.fixture
def sample_articles():
    return [
        RawArticle(
            id="a1", title="Rust 2026 Roadmap", url="https://rust-lang.org/2026",
            source_name="HN", hash="hash1", fetched_at="2026-05-25T08:00:00Z"
        ),
        RawArticle(
            id="a2", title="Rust 2026 Roadmap Released", url="https://rust-lang.org/2026",
            source_name="Reddit", hash="hash1", fetched_at="2026-05-25T08:00:00Z"
        ),
        RawArticle(
            id="a3", title="Go 1.24 Released", url="https://go.dev/1.24",
            source_name="HN", hash="hash2", fetched_at="2026-05-25T08:00:00Z"
        ),
    ]


def test_deduplicate_removes_exact_duplicates(sample_articles):
    dedup = Deduplicator()
    result = dedup.deduplicate(sample_articles)

    assert len(result) == 2
    assert result[0].id == "a1"
    assert result[1].id == "a3"


def test_group_by_event(sample_articles):
    dedup = Deduplicator()
    # Use only unique articles for grouping
    unique = dedup.deduplicate(sample_articles)
    groups = dedup.group_by_event(unique)

    assert len(groups) == 2
