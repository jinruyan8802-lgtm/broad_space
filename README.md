# BroadSpace

A daily technical knowledge broadening tool that breaks through "information bubbles" by combining AI-powered digest reports with interactive web exploration and a temporal knowledge graph.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Go        │────▶│  Redis       │────▶│  Python     │────▶│  FastAPI │
│   Collector │     │  Streams     │     │  Processor  │     │  Server  │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
                                            │                    │
                        ┌───────────────────┘          ┌──────────────┴──┐
                        ▼                             │                  ▼
               ┌──────────────┐              ┌──────────────┐   ┌──────────────┐
               │  Neo4j       │              │  PostgreSQL  │   │  Prometheus  │
               │  (Graph)    │              │  (Content)   │   │  + Grafana   │
               └──────────────┘              └──────────────┘   └──────────────┘
                                            ▲
                                            │
┌─────────────┐                   ┌─────────┴──────────┐
│  Miniflux   │                   │    Next.js Web     │
│  (RSS)      │                   │  (port 3000)       │
└─────────────┘                   └────────────────────┘
```

## Quick Start

### 1. Start Infrastructure

```bash
docker compose up -d
```

Wait for healthy status:
```bash
docker compose ps
```

### 2. Configure LLM

**Default: LM Studio (local)** — processor connects to `http://localhost:1234/v1`

1. Open LM Studio and load your desired model
2. Click "Server" tab → Start server (default port 1234)

To use a different provider, set in `.env`:

```bash
# OpenRouter / custom OpenAI-compatible
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-3.5-sonnet
LLM_API_KEY=sk-...

# Anthropic direct (cloud)
ANTHROPIC_API_KEY=sk-ant-...
```

### 3. Build & Run

```bash
# Build Go collector
cd collector && go build -o bin/collector ./cmd/collector && cd ..

# Run via orchestration script
./broadspace.sh start
```

Or manually:
```bash
# Collector
./collector/bin/collector

# Processor
cd processor && source .venv/bin/activate && PYTHONPATH=src python -m processor.worker

# API
cd api && source .venv/bin/activate && uvicorn main:app --host 0.0.0.0 --port 8000
```

## Services

| Service     | Port  | Description |
|-------------|-------|-------------|
| FastAPI     | 8000  | REST API + Prometheus metrics (`/metrics`) |
| Miniflux    | 8080  | RSS feed aggregator (admin:admin123) |
| PostgreSQL  | 5432  | Content storage |
| Redis       | 6379  | Queue and caching |
| Neo4j       | 7474/7687 | Knowledge graph (user: neo4j, pass: broadspace) |
| Prometheus  | 9090  | Metrics collection |
| Grafana     | 3000  | Dashboard (admin:admin) |
| Next.js Web | 3000  | Knowledge graph visualization |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |
| GET | `/content` | List processed content |
| GET | `/content/{id}` | Get content by ID |
| GET | `/content?category=AI` | Filter by category |

## Project Structure

```
broad_space/
├── collector/              # Go collector service
│   ├── cmd/collector/      # Entry point
│   └── internal/
│       ├── source/         # Source plugins (RSS, HN, GitHub, ArXiv, V2EX)
│       └── queue/          # Redis Streams publisher
├── processor/              # Python processing service
│   └── src/processor/
│       ├── llm/           # LLM client (OpenAI/Anthropic)
│       ├── pipeline/      # Dedup, classification, summarization, ranking
│       └── knowledge/     # Triple extraction, Graphiti client
├── api/                    # FastAPI REST server + Prometheus metrics
├── web/                    # Next.js 14 (TypeScript, Tailwind, D3.js)
├── delivery/               # Email digest, WeCom bot, APScheduler
├── docs/superpowers/plans/ # Phase 2 & 3 design documents
└── monitoring/             # Prometheus + Grafana configs
```

## Development

### Running Tests

```bash
# Processor unit tests
cd processor && python -m pytest tests/ -v

# Delivery unit tests
cd delivery && PYTHONPATH=src python -m pytest tests/ -v

# Integration test
./broadspace.sh test
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_USER` | broadspace | PostgreSQL user |
| `DB_PASSWORD` | change_me_in_production | PostgreSQL password |
| `DB_NAME` | broadspace | Database name |
| `DB_HOST` | localhost | PostgreSQL host |
| `REDIS_URL` | redis://localhost:6379/0 | Redis connection |
| `LLM_BASE_URL` | http://localhost:1234/v1 | LLM API base (local LM Studio) |
| `LLM_MODEL` | claude-sonnet-4-6 | Model name |
| `LLM_API_KEY` | sk-null | API key for local models |
| `ANTHROPIC_API_KEY` | - | Anthropic API key (cloud fallback) |

### Orchestration Script

```bash
./broadspace.sh start    # Start all services
./broadspace.sh stop     # Stop all services
./broadspace.sh restart  # Restart all services
./broadspace.sh status   # Show status of all services
./broadspace.sh test     # Run integration tests
```