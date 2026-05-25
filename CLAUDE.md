# Project Context

BroadSpace is a daily technical knowledge broadening tool with:
- **Go collector**: Fetches from RSS (Miniflux), Hacker News, GitHub Trending, ArXiv, V2EX
- **Python processor**: LLM-based dedup → classification → summarization → cross-source analysis → knowledge graph
- **FastAPI**: REST API serving processed content with Prometheus metrics
- **Next.js web**: Interactive knowledge graph visualization with D3.js
- **Storage**: PostgreSQL + Redis Streams + Neo4j (knowledge graph)

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Go        │────▶│  Redis       │────▶│  Python     │────▶│  FastAPI │
│   Collector │     │  Streams     │     │  Processor  │     │  Server  │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
                                                                  │
┌─────────────┐     ┌──────────────┐              ┌──────────────┴──────────┐
│  Miniflux   │     │  Neo4j       │              │  PostgreSQL              │
│  (RSS)      │     │  (Graph)     │              │  (Content DB)           │
└─────────────┘     └──────────────┘              └─────────────────────────┘
```

## Phase 2 - Knowledge Graph & Intelligence

- **SemanticDeduplicator**: FastEmbed embedding-based dedup, cosine similarity ≥0.85
- **TripleExtractor**: LLM extracts subject/predicate/object triples
- **GraphitiClient**: Neo4j temporal knowledge graph with APOC plugin
- **Ranker**: Explore/Exploit/Expand scoring strategy
- **Chinese sources**: V2EX (hot topics JSON API), Zhihu (stub, requires auth)
- **Prometheus metrics**: REQUEST_COUNT, REQUEST_LATENCY histograms

## Phase 3 - Distribution & Frontend

- **Next.js web** (port 3000): D3.js force-directed graph, signal badges, Tailwind CSS
- **Email digest**: Jinja2 templates, SMTP, daily APScheduler cron (8:00 AM)
- **WeCom bot**: Markdown push, 8:00 AM / 6:00 PM APScheduler cron
- **Prometheus** (port 9090): Metrics collection, scrape_configs for api and node
- **Grafana** (port 3000): Dashboard visualization

# LLM Configuration

**Default: LM Studio (local)** — processor connects to `http://localhost:1234/v1`

When editing LLM code, default to LM Studio-compatible patterns:
- OpenAI-compatible `/v1/chat/completions` endpoint
- `LLM_API_KEY=sk-null` for local models
- JSON extraction for structured outputs

Handle Claude ThinkingBlock in responses (iterate content blocks, skip non-text blocks).

# Code Guidelines

- **Go collector**: goroutine pool pattern (max 50 concurrency), Redis Streams (xadd), V2EX JSON API
- **Python processor**: Pydantic models for typed data flow, SQLAlchemy for PostgreSQL, FastEmbed for embeddings
- **All configs via environment variables** (no hardcoding)
- **Deduplicator**: Use standalone hash-based class, NOT SemanticDeduplicator subclass (avoids embedding model load)
- **API Dockerfile**: Use `uv run uvicorn` (not bare `uvicorn`) due to venv path issues

# Docker Services

| Service     | Port  | Description                    |
|-------------|-------|--------------------------------|
| api         | 8000  | FastAPI + Prometheus metrics   |
| postgres    | 5432  | PostgreSQL 16 (healthy)        |
| redis       | 6379  | Redis 7 (healthy)              |
| neo4j       | 7474/7687 | Neo4j 5 + APOC (healthy)   |
| miniflux    | 8080  | RSS aggregator (healthy)       |
| prometheus  | 9090  | Metrics collection             |
| grafana     | 3000  | Dashboard (may not pull image) |

Start: `docker compose up -d`
Check: `docker compose ps`
Logs: `docker logs <container>`