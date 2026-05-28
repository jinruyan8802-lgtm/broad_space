from __future__ import annotations
import os
from datetime import datetime, timezone
from typing import Any

try:
    from graphiti_core import Graphiti
    from graphiti_core.edges import EntityEdge
    GRAPHTI_AVAILABLE = True
except ImportError:
    GRAPHTI_AVAILABLE = False
    Graphiti = None
    EntityEdge = None

from processor.models import ProcessedContent

DEFAULT_CATEGORIES = [
    "AI/ML", "Infrastructure", "Programming Languages",
    "Security", "Frontend", "Mobile", "Database",
    "DevOps", "Open Source", "Academic",
    "Startup", "Science", "Hardware", "Product"
]


class Ranker:
    def __init__(self, user_categories: list[str] | None = None, graphiti_client: Any | None = None):
        self.user_categories = set(user_categories or ["AI/ML", "Infrastructure"])
        self._seen_categories: set[str] = set()
        self.graphiti_client = graphiti_client

    def score(self, content: ProcessedContent) -> dict[str, float]:
        # Exploit: overlap with user interests
        cat_overlap = len(set(content.categories) & self.user_categories)
        exploit = min(cat_overlap / max(len(self.user_categories), 1), 1.0) * content.signal_strength

        # Expand: graph proximity
        expand = self._compute_graph_proximity(content)

        # Explore: novelty (categories not seen before) + high signal
        novel = len(set(content.categories) - self._seen_categories)
        explore = (novel / max(len(DEFAULT_CATEGORIES), 1)) * content.signal_strength
        self._seen_categories.update(content.categories)

        return {
            "exploit": exploit,
            "expand": expand,
            "explore": explore,
        }

    def _compute_graph_proximity(self, content: ProcessedContent) -> float:
        """Compute graph-based expand score via Neo4j search_sync()."""
        if not self.graphiti_client:
            return 0.3

        try:
            results = self.graphiti_client.search_sync(content.title, limit=5)
            if not results:
                return 0.3
            # Normalize: avg score of top results, scaled to [0, 0.5]
            avg_score = sum(r["score"] for r in results) / len(results)
            return min(avg_score * 0.5, 1.0)
        except Exception:
            return 0.3

    def rank(
        self,
        contents: list[ProcessedContent],
        w_exploit: float = 0.5,
        w_expand: float = 0.3,
        w_explore: float = 0.2,
    ) -> list[ProcessedContent]:
        scored = []
        for c in contents:
            s = self.score(c)
            total = w_exploit * s["exploit"] + w_expand * s["expand"] + w_explore * s["explore"]
            scored.append((total, c))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [c for _, c in scored]