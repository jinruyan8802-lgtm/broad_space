from collections import defaultdict

from processor.models import RawArticle


class Deduplicator:
    def __init__(self, similarity_threshold: float = 0.85):
        self.threshold = similarity_threshold
        self.seen_hashes: set[str] = set()
        # For Phase 1, use exact hash dedup. Semantic similarity via embeddings comes in Phase 2.

    def is_duplicate(self, article: RawArticle) -> bool:
        return article.hash in self.seen_hashes

    def add(self, article: RawArticle) -> None:
        self.seen_hashes.add(article.hash)

    def deduplicate(self, articles: list[RawArticle]) -> list[RawArticle]:
        unique: list[RawArticle] = []
        for article in articles:
            if not self.is_duplicate(article):
                self.add(article)
                unique.append(article)
        return unique

    def group_by_event(self, articles: list[RawArticle]) -> list[list[RawArticle]]:
        """Group articles covering the same event by URL prefix or title similarity."""
        groups: dict[str, list[RawArticle]] = defaultdict(list)
        for article in articles:
            # Use URL domain + first 30 chars of title as grouping key
            key = f"{article.source_name}:{article.title[:30].lower().strip()}"
            groups[key].append(article)
        return list(groups.values())
