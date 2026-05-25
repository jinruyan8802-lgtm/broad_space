# BroadSpace

A daily technical knowledge broadening tool that breaks through "information bubbles" by combining AI-powered digest reports with interactive web exploration.

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Go        │────▶│  Redis       │────▶│  Python     │────▶│  FastAPI │
│   Collector │     │  Streams     │     │  Processor  │     │  Server  │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
                                                                  │
┌─────────────┐                                                   ▼
│  Miniflux   │                                          ┌──────────────┐
│  (RSS)      │                                          │  PostgreSQL  │
└─────────────┘                                          └──────────────┘
```

## Quick Start

### 1. Environment Setup

```bash
cp .env.example .env
# Edit .env with your settings
```

### 2. Start Infrastructure

```bash
docker compose up -d
```

### 3. Configure LLM

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

### 4. Run Collector

```bash
cd collector && go build -o bin/collector ./cmd/collector
./bin/collector
```

### 5. Run Processor

```bash
cd processor
source .venv/bin/activate  # or appropriate venv activation
python -m processor.worker
```

### 6. Run API Server

```bash
cd api
source .venv/bin/activate
uvicorn main:app --reload
```

## Services

| Service     | Port | Description |
|-------------|------|-------------|
| FastAPI     | 8000 | REST API for content retrieval |
| Miniflux    | 8080 | RSS feed aggregator (admin:admin123) |
| PostgreSQL  | 5432 | Content storage |
| Redis       | 6379 | Queue and caching |

## Project Structure

```
broad_space/
├── collector/          # Go collector service
│   ├── cmd/collector/  # Entry point
│   └── internal/
│       ├── config/    # Configuration
│       ├── source/     # Source plugins (RSS, HN, GitHub, ArXiv)
│       ├── normalizer/ # Article normalization
│       └── queue/      # Redis Streams publisher
├── processor/          # Python processing service
│   └── src/processor/
│       ├── llm/       # LLM client
│       └── pipeline/  # Processing stages
├── api/                # FastAPI REST server
├── docs/               # Design documents
└── tests/              # Integration tests
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/health` | Health check |
| GET | `/content` | List processed content |
| GET | `/content/{id}` | Get content by ID |

## Development

### Running Tests

```bash
pytest tests/integration/test_pipeline.py -v
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_USER` | broadspace | PostgreSQL user |
| `DB_PASSWORD` | change_me_in_production | PostgreSQL password |
| `DB_NAME` | broadspace | Database name |
| `REDIS_URL` | redis://localhost:6379/0 | Redis connection |
| `LLM_BASE_URL` | http://localhost:1234/v1 | LLM API base (local LM Studio) |
| `LLM_MODEL` | (first loaded model) | LLM model name |
| `LLM_API_KEY` | sk-null | API key for local models |
| `ANTHROPIC_API_KEY` | - | Anthropic API key (cloud fallback) |