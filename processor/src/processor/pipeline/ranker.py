from processor.models import ProcessedContent

DEFAULT_CATEGORIES = [
    "AI/ML", "Infrastructure", "Programming Languages",
    "Security", "Frontend", "Mobile", "Database",
    "DevOps", "Open Source", "Academic"
]


class Ranker:
    def __init__(self, user_categories: list[str] | None = None):
        self.user_categories = set(user_categories or ["AI/ML", "Infrastructure"])
        self._seen_categories: set[str] = set()

    def score(self, content: ProcessedContent) -> dict[str, float]:
        # Exploit: overlap with user interests
        cat_overlap = len(set(content.categories) & self.user_categories)
        exploit = min(cat_overlap / max(len(self.user_categories), 1), 1.0) * content.signal_strength

        # Expand: graph proximity (stub — Phase 2.5)
        expand = 0.3

        # Explore: novelty (categories not seen before) + high signal
        novel = len(set(content.categories) - self._seen_categories)
        explore = (novel / max(len(DEFAULT_CATEGORIES), 1)) * content.signal_strength
        self._seen_categories.update(content.categories)

        return {
            "exploit": exploit,
            "expand": expand,
            "explore": explore,
        }

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