# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

BroadSpace is a multi-service daily technical knowledge aggregator. Data flows:

```
Go Collector → Redis Streams → Python Processor → PostgreSQL + Neo4j
                                                  ↓
                                            FastAPI Server ←── Next.js Web
```

- **Go collector** (`collector/`): Fetches from 9 sources (Miniflux RSS, HN, GitHub Trending, ArXiv, V2EX, Juejin, Lobsters, Dev.to, 36Kr). Publishes to Redis Stream `broadspace:articles` via `XADD`. Goroutine pool (max 50). Also exposes an ad-hoc trigger API on port 9100 (`POST /collect/{source}`).
- **Python processor** (`processor/`): Consumes from Redis Streams (consumer group `processor`). Pipeline: Deduplicator → Classifier → Summarizer → Translator → CrossSourceAnalyzer → TripleExtractor → Ranker (Explore/Exploit/Expand scoring). Stores in PostgreSQL (`processed_articles` table) and writes triples to Neo4j via `GraphitiClient`.
- **FastAPI server** (`api/`): Serves `/content`, `/content/{id}`, `/graph/search`, `/analytics`, `/dashboard/stats`, `/health`, `/metrics` (Prometheus). Reads from PostgreSQL and Neo4j.
- **Next.js web** (`web/`): Next.js 14, TypeScript, Tailwind CSS, D3.js. Pages: `/` (feed), `/dashboard`, `/trend`, `/search`, `/signal`. Fetches from FastAPI via `src/lib/api.ts`.
- **Delivery** (`delivery/`): APScheduler cron jobs for email digest (8am) and WeCom bot push (8am/6pm). Jinja2 templates in `delivery/templates/`.

## Common Commands

### Orchestration (recommended)

```bash
./broadspace.sh start     # Docker services → build collector → start processor + web
./broadspace.sh stop      # Kill all services + docker compose down
./broadspace.sh restart   # Stop then start
./broadspace.sh status    # Show PIDs + Docker status + endpoint health
./broadspace.sh build     # Build all: collector binary, api+delivery Docker images, web bundle
./broadspace.sh build <component>  # collector | api | delivery | web
./broadspace.sh test      # Run integration tests (tests/integration/test_pipeline.py)
```

### Individual Services

```bash
# Collector
cd collector && go build -o bin/collector ./cmd/collector
./collector/bin/collector

# Processor (needs its own venv)
cd processor && source .venv/bin/activate && PYTHONPATH=src python -m processor.worker

# API (needs its own venv, or use Docker)
cd api && source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000

# Web
cd web && npm run dev      # port 3000

# Delivery (needs its own venv)
cd delivery && source .venv/bin/activate && PYTHONPATH=src python -m delivery
```

### Tests

```bash
# Processor unit tests
cd processor && source .venv/bin/activate && PYTHONPATH=src python -m pytest tests/ -v

# API unit tests
cd api && source .venv/bin/activate && python -m pytest tests/ -v

# Delivery unit tests
cd delivery && source .venv/bin/activate && PYTHONPATH=src python -m pytest tests/ -v

# Collector Go tests
cd collector && go test ./...

# Integration tests
./broadspace.sh test
# Or manually:
PYTHONPATH=processor/src python -m pytest tests/integration/test_pipeline.py -v
```

### Docker

```bash
docker compose up -d       # Start postgres, redis, miniflux, neo4j, api, delivery
docker compose ps          # Check health
docker compose logs -f api # Tail API logs
docker compose build api   # Rebuild API image
```

## Architecture Details

### Data Flow (multi-file)

1. **Collection**: `collector/cmd/collector/main.go:runCollection()` spawns goroutines per source → each source implements `source.Source` interface (`internal/source/*.go`) → articles are normalized (`internal/normalizer/normalizer.go`) → published to Redis Stream via `internal/queue/redis.go`.

2. **Processing**: `processor/src/processor/worker.py:Worker.run()` reads from Redis Streams (consumer group `processor`) → pipeline stages in `processor/src/processor/pipeline/`:
   - `dedup.py`: Hash-based dedup (standalone class, NOT `SemanticDeduplicator` subclass)
   - `classifier.py`: LLM-based category classification
   - `summarizer.py`: LLM summary + key points extraction
   - `translator.py`: Chinese translation (title, summary, key_points)
   - `analyzer.py`: Cross-source analysis (merges related articles)
   - `ranker.py`: Explore/Exploit/Expand scoring → `final_score`
   - `knowledge/extractor.py`: LLM extracts subject/predicate/object triples
   - `knowledge/graphiti_client.py`: Writes triples to Neo4j

3. **Storage**: PostgreSQL `processed_articles` table (schema managed by SQLAlchemy in `processor/src/processor/worker_models.py`). Neo4j stores temporal knowledge graph (APOC plugin required).

4. **API**: `api/main.py` — FastAPI with SQLAlchemy raw queries, Prometheus metrics (`REQUEST_COUNT`, `REQUEST_LATENCY`), CORS enabled. Lifespan handler auto-migrates columns (`triples`, `published_at`, `language`, `title_zh`, etc.).

5. **Frontend**: `web/src/lib/api.ts` defines TypeScript interfaces matching API responses. `web/src/app/page.tsx` is the main feed. `web/src/app/dashboard/page.tsx` shows analytics.

### Multi-Venv Setup

Each Python service has its own `.venv` (managed by `uv`):
- `processor/.venv/` — processor dependencies + dev deps (pytest, factory-boy)
- `api/.venv/` — API dependencies + dev deps
- `delivery/.venv/` — delivery dependencies + dev deps (pytest, pytest-mock)

Always activate the correct venv before running tests or the service.

### LLM Configuration

**Default: LM Studio (local)** at `http://localhost:1234/v1`

- `LLM_API_KEY=sk-null` for local models
- OpenAI-compatible `/v1/chat/completions` endpoint
- JSON extraction for structured outputs
- Handle Claude `ThinkingBlock` in responses (iterate content blocks, skip non-text blocks)

Cloud fallback via `ANTHROPIC_API_KEY` or set `LLM_BASE_URL` to OpenRouter.

### Docker Services

| Service     | Port  | Description                    |
|-------------|-------|--------------------------------|
| api         | 8000  | FastAPI + Prometheus metrics   |
| postgres    | 5432  | PostgreSQL 16                  |
| redis       | 6379  | Redis 7 (Streams + AOF)        |
| neo4j       | 7474/7687 | Neo4j 5 + APOC plugin      |
| miniflux    | 8080  | RSS aggregator (admin:admin123)|
| prometheus  | 9090  | Metrics collection             |
| grafana     | 3001  | Dashboard (admin:admin)        |
| delivery    | —     | APScheduler cron (no exposed port) |

### Code Guidelines

- **Go**: goroutine pool pattern, Redis Streams (`XADD`), all source configs via env vars
- **Python**: Pydantic models for typed data flow, SQLAlchemy for PostgreSQL, all configs via env vars
- **Next.js**: TypeScript, Tailwind CSS, D3.js, client-side fetching from FastAPI
- **Deduplicator**: Use standalone hash-based class (`Deduplicator`), NOT `SemanticDeduplicator` subclass (avoids embedding model load on init)
- **API Dockerfile**: Use `python -m uvicorn` (not bare `uvicorn`) — see `api/Dockerfile:10`
