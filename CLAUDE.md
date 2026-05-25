# Project Context

BroadSpace is a daily technical knowledge broadening tool with:
- **Go collector**: Fetches from RSS (Miniflux), Hacker News, GitHub Trending, ArXiv
- **Python processor**: LLM-based dedup → classification → summarization → cross-source analysis
- **FastAPI**: REST API serving processed content
- **Storage**: PostgreSQL + Redis Streams

# LLM Configuration

**Default: LM Studio (local)** — processor expects `LLM_BASE_URL=http://localhost:1234/v1`

When editing LLM code, default to LM Studio-compatible patterns:
- OpenAI-compatible `/v1/chat/completions` endpoint
- `LLM_API_KEY=sk-null` for local models
- JSON extraction for structured outputs

Only use Anthropic when explicitly requested or when code must support cloud LLM.

# Code Guidelines

- Go collector: goroutine pool pattern (max 50 concurrency), Redis Streams for queuing
- Python processor: Pydantic models for typed data flow, SQLAlchemy for PostgreSQL
- All configs via environment variables (no hardcoding)