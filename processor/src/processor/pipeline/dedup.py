from collections import defaultdict
from typing import Optional

try:
    import numpy as np
    import fastembed
    from fastembed import TextEmbedding
    FASTEMBED_AVAILABLE = True
except ImportError:
    FASTEMBED_AVAILABLE = False

from processor.models import RawArticle


class SemanticDeduplicator:
    def __init__(self, similarity_threshold: float = 0.85):
        self.threshold = similarity_threshold
        self.seen_hashes: set[str] = set()
        self.seen_embeddings: list[tuple[str, list[float]]] = []
        self._model: Optional[TextEmbedding] = None

    @property
    def model(self) -> Optional[TextEmbedding]:
        if not FASTEMBED_AVAILABLE:
            return None
        if self._model is None:
            self._model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        return self._model

    def _embed(self, text: str) -> Optional[list[float]]:
        m = self.model
        if m is None:
            return None
        try:
            result = list(next(iter(m.embed([text]))))
            return result
        except Exception:
            return None

    @staticmethod
    def _cosine_similarity(a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return dot / (norm_a * norm_b)

    def is_duplicate(self, article: RawArticle) -> bool:
        if article.hash in self.seen_hashes:
            return True
        emb = self._embed(f"{article.title} {article.content[:500]}")
        if emb is None:
            # Fallback to hash-only dedup if embeddings unavailable
            return article.hash in self.seen_hashes
        for _, seen_emb in self.seen_embeddings:
            sim = self._cosine_similarity(emb, seen_emb)
            if sim >= self.threshold:
                return True
        return False

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
            key = f"{article.source_name}:{article.title[:30].lower().strip()}"
            groups[key].append(article)
        return list(groups.values())


class Deduplicator:
    """Backward-compatible hash-based deduplication (no embedding model load)."""
    def __init__(self):
        self._seen: set[str] = set()

    def is_duplicate(self, article: RawArticle) -> bool:
        if article.hash in self._seen:
            return True
        self._seen.add(article.hash)
        return False

    def add(self, article: RawArticle) -> None:
        self._seen.add(article.hash)

    def deduplicate(self, articles: list[RawArticle]) -> list[RawArticle]:
        unique = []
        for article in articles:
            if not self.is_duplicate(article):
                unique.append(article)
        return unique

    def group_by_event(self, articles: list[RawArticle]) -> list[list[RawArticle]]:
        from collections import defaultdict
        groups: dict[str, list[RawArticle]] = defaultdict(list)
        for article in articles:
            key = f"{article.source_name}:{article.title[:30].lower().strip()}"
            groups[key].append(article)
        return list(groups.values())