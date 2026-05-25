# BroadSpace Phase 2 — Knowledge Graph & Intelligence Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add time-aware knowledge graph (Graphiti + Neo4j), semantic deduplication, Chinese sources, and explore/exploit recommendation ranking on top of the Phase 1 core pipeline.

**Architecture:** Processor output flows into a knowledge extraction layer that builds a temporal knowledge graph. Embeddings enable semantic deduplication. A ranker scores content by exploit/expand/explore strategy. Chinese sources broaden coverage.

**Tech Stack:** Neo4j 5, Graphiti, sentence-transformers (or TEI), FastEmbed, Go (scraper expansion), Python 3.12

---

## File Structure (Phase 2)

```
broad-space/
├── docker-compose.yml          # + Neo4j
├── collector/
│   └── internal/source/
│       ├── zhihu.go            # Zhihu scraper
│       └── v2ex.go             # V2EX scraper
├── processor/
│   └── src/processor/
│       ├── pipeline/
│       │   ├── embedder.py     # Semantic embedding + similarity
│       │   └── ranker.py       # Explore/Exploit/Expand scorer
│       └── knowledge/
│           ├── __init__.py
│           ├── extractor.py    # Triple extraction via LLM
│           ├── graphiti_client.py
│           └── retriever.py    # Hybrid RRF retrieval
├── knowledge/                  # Standalone KG service
│   ├── pyproject.toml
│   └── src/knowledge/
│       ├── graph.py
│       └── api.py
└── docs/superpowers/plans/
    └── 2026-05-25-broadspace-phase2.md
```

---

## Prerequisites

Before starting Phase 2, ensure:
1. Phase 1 is running end-to-end (`./start.sh test` passes)
2. Docker has at least 4GB RAM available (Neo4j requirement)
3. LLM endpoint is reachable (local or cloud) for triple extraction

---

### Task 1: Infrastructure — Add Neo4j to Docker Compose

**Goal:** Run Neo4j alongside existing Postgres/Redis/Miniflux.

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add Neo4j service**

```yaml
  neo4j:
    image: neo4j:5-community
    environment:
      NEO4J_AUTH: ${NEO4J_USER:-neo4j}/${NEO4J_PASSWORD:-broadspace}
      NEO4J_PLUGINS: '["apoc", "gds"]'
    volumes:
      - neo4j_data:/data
      - neo4j_logs:/logs
    ports:
      - "7474:7474"   # Browser
      - "7687:7687"   # Bolt
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://localhost:7474"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
  neo4j_data:
  neo4j_logs:
```

- [ ] **Step 2: Update .env.example**

```bash
# Neo4j
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=broadspace
```

- [ ] **Step 3: Verify**

```bash
docker compose up -d neo4j
# Wait 30s, then open http://localhost:7474
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "infra: add Neo4j to Docker Compose"
```

---

### Task 2: Knowledge Graph — Triple Extraction Pipeline

**Goal:** Extract structured triples (subject, predicate, object) from processed content using LLM.

**Files:**
- Create: `processor/src/processor/knowledge/__init__.py`
- Create: `processor/src/processor/knowledge/extractor.py`
- Create: `processor/tests/test_extractor.py`

- [ ] **Step 1: Create extractor**

```python
from processor.llm.client import LLMClient
from processor.models import ProcessedContent

SYSTEM_PROMPT = """Extract knowledge triples from the tech news article.

Rules:
- Entity types: Technology, Event, Organization, Person, Concept, Trend, Paper
- Relation types: depends_on, drives, competes_with, created_by, implements, evolves_from, replaces, published_in, related_to
- Confidence: EXTRACTED (directly stated), INFERRED (reasonable inference), SPECULATIVE (weak signal)

Respond with JSON only:
{
    "triples": [
        {"subject": "...", "predicate": "...", "object": "...", "confidence": "EXTRACTED"}
    ]
}"""


class TripleExtractor:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def extract(self, content: ProcessedContent) -> list[dict]:
        prompt = f"Title: {content.title}\nSummary: {content.summary}\nKey points: {content.key_points}"
        try:
            result = self.llm.chat_json(SYSTEM_PROMPT, prompt)
            triples = result.get("triples", [])
            # Normalize
            for t in triples:
                t.setdefault("confidence", "EXTRACTED")
            return triples
        except Exception:
            return []
```

- [ ] **Step 2: Write test**

```python
from unittest.mock import MagicMock
from processor.knowledge.extractor import TripleExtractor

def test_extract_returns_triples():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {
        "triples": [
            {"subject": "Rust", "predicate": "evolves_from", "object": "C++", "confidence": "EXTRACTED"}
        ]
    }
    extractor = TripleExtractor(mock_llm)
    from processor.models import ProcessedContent
    content = ProcessedContent(id="t1", title="Rust 2.0", url="https://rust-lang.org")
    result = extractor.extract(content)
    assert len(result) == 1
    assert result[0]["subject"] == "Rust"
```

- [ ] **Step 3: Commit**

```bash
git add processor/src/processor/knowledge/ processor/tests/test_extractor.py
git commit -m "feat(knowledge): add LLM-based triple extractor"
```

---

### Task 3: Knowledge Graph — Graphiti Client

**Goal:** Integrate Graphiti to write triples into Neo4j with temporal validity windows.

**Files:**
- Create: `processor/src/processor/knowledge/graphiti_client.py`
- Create: `processor/tests/test_graphiti_client.py`

- [ ] **Step 1: Install Graphiti**

```bash
cd processor
pip install graphiti-core
```

- [ ] **Step 2: Create client**

```python
import os
from datetime import datetime, timezone

from graphiti_core import Graphiti
from graphiti_core.nodes import EntityNode
from graphiti_core.edges import EntityEdge


class GraphitiClient:
    def __init__(self, uri: str | None = None, user: str | None = None, password: str | None = None):
        self.uri = uri or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.environ.get("NEO4J_USER", "neo4j")
        self.password = password or os.environ.get("NEO4J_PASSWORD", "broadspace")
        self.graphiti = Graphiti(self.uri, self.user, self.password)

    async def add_triples(self, content_id: str, triples: list[dict], valid_at: datetime | None = None):
        valid_at = valid_at or datetime.now(timezone.utc)
        for t in triples:
            await self.graphiti.add_entity_edge(
                EntityEdge(
                    source_node_name=t["subject"],
                    target_node_name=t["object"],
                    relation_type=t["predicate"],
                    fact=t.get("fact", f"{t['subject']} {t['predicate']} {t['object']}"),
                    valid_at=valid_at,
                )
            )

    async def search(self, query: str, limit: int = 10):
        return await self.graphiti.search(query, limit)
```

- [ ] **Step 3: Write test (mocked)**

```python
import pytest
from unittest.mock import AsyncMock, patch
from processor.knowledge.graphiti_client import GraphitiClient

@pytest.mark.asyncio
async def test_add_triples():
    with patch("processor.knowledge.graphiti_client.Graphiti") as MockGraphiti:
        mock_instance = AsyncMock()
        MockGraphiti.return_value = mock_instance

        client = GraphitiClient()
        await client.add_triples("evt_001", [
            {"subject": "Python", "predicate": "drives", "object": "AI adoption"}
        ])
        assert mock_instance.add_entity_edge.called
```

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/knowledge/graphiti_client.py processor/tests/test_graphiti_client.py processor/pyproject.toml
git commit -m "feat(knowledge): add Graphiti Neo4j client"
```

---

### Task 4: Processor — Semantic Deduplication

**Goal:** Replace exact-hash dedup with embedding-based semantic similarity (≥85% threshold).

**Files:**
- Create: `processor/src/processor/pipeline/embedder.py`
- Create: `processor/tests/test_embedder.py`

- [ ] **Step 1: Install embedding dependency**

```bash
cd processor
pip install fastembed
```

- [ ] **Step 2: Create embedder + semantic dedup**

```python
from collections import defaultdict

from fastembed import TextEmbedding
from processor.models import RawArticle


class SemanticDeduplicator:
    def __init__(self, similarity_threshold: float = 0.85):
        self.threshold = similarity_threshold
        self.seen_hashes: set[str] = set()
        self.seen_embeddings: list[tuple[str, list[float]]] = []
        self._model = None

    @property
    def model(self) -> TextEmbedding:
        if self._model is None:
            self._model = TextEmbedding(model_name="BAAI/bge-small-en-v1.5")
        return self._model

    def _embed(self, text: str) -> list[float]:
        return list(next(iter(self.model.embed([text]))))

    def _cosine_similarity(self, a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        norm_a = sum(x * x for x in a) ** 0.5
        norm_b = sum(x * x for x in b) ** 0.5
        return dot / (norm_a * norm_b) if norm_a and norm_b else 0.0

    def is_duplicate(self, article: RawArticle) -> bool:
        if article.hash in self.seen_hashes:
            return True
        text = f"{article.title} {article.content[:500]}"
        emb = self._embed(text)
        for _, seen_emb in self.seen_embeddings:
            if self._cosine_similarity(emb, seen_emb) >= self.threshold:
                return True
        self.seen_embeddings.append((article.hash, emb))
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
```

- [ ] **Step 3: Write test**

```python
from unittest.mock import patch, MagicMock
import numpy as np
from processor.models import RawArticle
from processor.pipeline.embedder import SemanticDeduplicator

def test_semantic_dedup():
    with patch.object(SemanticDeduplicator, "model", new_callable=MagicMock) as mock_model:
        # Mock embeddings: a1/a2 similar, a3 different
        mock_model.embed.return_value = iter([
            np.array([1.0, 0.0]),
            np.array([0.99, 0.01]),
            np.array([0.0, 1.0]),
        ])
        dedup = SemanticDeduplicator(similarity_threshold=0.85)
        articles = [
            RawArticle(id="a1", title="Rust Roadmap", url="x", source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z", content="Rust 2026 roadmap is out."),
            RawArticle(id="a2", title="Rust 2026 Roadmap Released", url="y", source_name="Reddit", hash="h2", fetched_at="2026-05-25T08:00:00Z", content="The Rust team published their 2026 roadmap."),
            RawArticle(id="a3", title="Go 1.24", url="z", source_name="HN", hash="h3", fetched_at="2026-05-25T08:00:00Z", content="Go 1.24 released today."),
        ]
        result = dedup.deduplicate(articles)
        assert len(result) == 2  # a1 kept, a2 deduped, a3 kept
```

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/pipeline/embedder.py processor/tests/test_embedder.py processor/pyproject.toml
git commit -m "feat(processor): add semantic deduplication with fastembed"
```

---

### Task 5: Collector — Chinese Sources (Zhihu, V2EX)

**Goal:** Add scrapers for Chinese tech communities.

**Files:**
- Create: `collector/internal/source/zhihu.go`
- Create: `collector/internal/source/v2ex.go`

- [ ] **Step 1: Zhihu scraper (stub)**

```go
package source

import "fmt"

func NewZhihu() *ScraperSource {
	return NewScraper("zhihu", "https://www.zhihu.com/api/v3/feed/topstory",
		func(body []byte) ([]Article, error) {
			// Phase 2 stub: full implementation requires auth/session handling
			return []Article{}, nil
		})
}
```

- [ ] **Step 2: V2EX scraper**

```go
package source

import (
	"encoding/json"
	"fmt"
)

func NewV2EX() *ScraperSource {
	return NewScraper("v2ex", "https://www.v2ex.com/api/topics/hot.json",
		func(body []byte) ([]Article, error) {
			var topics []struct {
				ID          int    `json:"id"`
				Title       string `json:"title"`
				URL         string `json:"url"`
				Content     string `json:"content"`
				Created     int64  `json:"created"`
			}
			if err := json.Unmarshal(body, &topics); err != nil {
				return nil, fmt.Errorf("v2ex parse: %w", err)
			}
			articles := make([]Article, 0, len(topics))
			for _, t := range topics {
				articles = append(articles, Article{
					ID:          fmt.Sprintf("v2ex_%d", t.ID),
					Title:       fmt.Sprintf("[V2EX] %s", t.Title),
					URL:         t.URL,
					SourceName:  "v2ex",
					PublishedAt: fmt.Sprintf("%d", t.Created),
					Content:     t.Content,
				})
			}
			return articles, nil
		})
}
```

- [ ] **Step 3: Wire into main.go**

```go
sources := []source.Source{
    source.NewMiniflux(cfg.MinifluxURL, cfg.MinifluxUser, cfg.MinifluxPass),
    source.NewHackerNews(),
    source.NewGitHubTrending(),
    source.NewArXiv(),
    source.NewV2EX(),
    // source.NewZhihu(), // requires auth, enable when ready
}
```

- [ ] **Step 4: Commit**

```bash
git add collector/internal/source/zhihu.go collector/internal/source/v2ex.go collector/cmd/collector/main.go
git commit -m "feat(collector): add V2EX and Zhihu (stub) Chinese sources"
```

---

### Task 6: Processor — Explore/Exploit Ranker

**Goal:** Score and rank content by three strategies: exploit (interest match), expand (graph proximity), explore (novelty + diversity).

**Files:**
- Create: `processor/src/processor/pipeline/ranker.py`
- Create: `processor/tests/test_ranker.py`

- [ ] **Step 1: Create ranker**

```python
from processor.models import ProcessedContent

DEFAULT_CATEGORIES = ["AI/ML", "Infrastructure", "Programming Languages", "Security", "Frontend", "Mobile", "Database", "DevOps", "Open Source", "Academic"]


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

    def rank(self, contents: list[ProcessedContent], w_exploit: float = 0.5, w_expand: float = 0.3, w_explore: float = 0.2) -> list[ProcessedContent]:
        scored = []
        for c in contents:
            s = self.score(c)
            total = w_exploit * s["exploit"] + w_expand * s["expand"] + w_explore * s["explore"]
            scored.append((total, c))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [c for _, c in scored]
```

- [ ] **Step 2: Write test**

```python
from processor.models import ProcessedContent
from processor.pipeline.ranker import Ranker

def test_rank_orders_by_signal_and_interest():
    ranker = Ranker(user_categories=["AI/ML"])
    contents = [
        ProcessedContent(id="a", title="AI News", categories=["AI/ML"], signal_strength=0.9),
        ProcessedContent(id="b", title="Rust Update", categories=["Programming Languages"], signal_strength=0.5),
        ProcessedContent(id="c", title="AI Breakthrough", categories=["AI/ML"], signal_strength=0.95),
    ]
    ranked = ranker.rank(contents)
    assert ranked[0].id == "c"  # highest signal + interest match
    assert ranked[1].id == "a"
```

- [ ] **Step 3: Commit**

```bash
git add processor/src/processor/pipeline/ranker.py processor/tests/test_ranker.py
git commit -m "feat(processor): add explore/exploit/expand ranker"
```

---

### Task 7: Observability — Log Rotation & Structured JSON

**Goal:** Add `logrotate` config and optional JSON formatter for production logs.

**Files:**
- Create: `logrotate.conf`
- Modify: `processor/src/processor/worker.py` (add JSON mode via env var)

- [ ] **Step 1: Create logrotate config**

```bash
cat > logrotate.conf << 'EOF'
/home/jinru/workon/broad_space/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    missingok
    notifempty
    create 0644 $(whoami) $(whoami)
}
EOF
```

- [ ] **Step 2: Add JSON formatter option to worker**

In `_setup_logging()`, check `LOG_FORMAT=json` env var and switch formatter:

```python
import json
import logging
import os

class JsonFormatter(logging.Formatter):
    def format(self, record):
        log_obj = {
            "ts": self.formatTime(record),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if hasattr(record, "duration_ms"):
            log_obj["duration_ms"] = record.duration_ms
        return json.dumps(log_obj, ensure_ascii=False)
```

- [ ] **Step 3: Commit**

```bash
git add logrotate.conf processor/src/processor/worker.py
git commit -m "feat(observability): add logrotate and optional JSON logging"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Implementing Task |
|-------------|-------------------|
| Neo4j 图谱存储 | Task 1 |
| 三元组抽取 | Task 2 |
| Graphiti 时间窗口 | Task 3 |
| 语义去重 (embedding) | Task 4 |
| 中文源 (V2EX, Zhihu stub) | Task 5 |
| 探索/利用排序 | Task 6 |
| 日志增强 | Task 7 |

### Gaps for Phase 2.5 (not in this plan)

- **Graph proximity scoring** — Task 6 `expand` score is stubbed; requires Graphiti query integration.
- **Zhihu full implementation** — Requires auth/session cookies.
- **User feedback loop** — Interest model updates from clicks not implemented.

---

## Execution Handoff

**Plan saved to `docs/superpowers/plans/2026-05-25-broadspace-phase2.md`.**

Phase 2 adds **intelligence** on top of the Phase 1 pipeline: knowledge graph for cross-temporal reasoning, semantic dedup for quality, ranking for personalization, and Chinese sources for coverage breadth.
