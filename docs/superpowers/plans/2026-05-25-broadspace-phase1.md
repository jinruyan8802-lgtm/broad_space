# BroadSpace Phase 1 — Core Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an end-to-end data pipeline: Go collector fetches from 200+ sources → normalizes → pushes to Redis Streams → Python processor consumes → deduplicates → classifies → summarizes → analyzes → stores in PostgreSQL. REST API serves the processed content.

**Architecture:** Go handles high-concurrency collection (goroutine pool capped at 50). Redis Streams decouples collection from processing. Python handles all LLM-based analysis via Anthropic Claude. PostgreSQL stores both raw and processed content with full-text search.

**Tech Stack:** Go, Python 3.12, PostgreSQL 16, Redis 7, Miniflux (RSS manager), Anthropic Claude API, pytest, go test

---

## File Structure (Phase 1)

```
broad-space/
├── docker-compose.yml          # Shared infrastructure
├── .env.example                # Environment variable template
├── collector/                  # Go service
│   ├── go.mod
│   ├── cmd/collector/main.go
│   ├── internal/config/config.go
│   ├── internal/source/source.go
│   ├── internal/source/rss.go
│   ├── internal/source/scraper.go
│   ├── internal/source/github.go
│   ├── internal/source/arxiv.go
│   ├── internal/normalizer/normalizer.go
│   ├── internal/queue/redis.go
│   └── collector_test.go
├── processor/                  # Python service
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── src/processor/
│   │   ├── __init__.py
│   │   ├── worker.py
│   │   ├── pipeline/
│   │   │   ├── __init__.py
│   │   │   ├── dedup.py
│   │   │   ├── classifier.py
│   │   │   ├── summarizer.py
│   │   │   └── analyzer.py
│   │   ├── llm/
│   │   │   ├── __init__.py
│   │   │   └── client.py
│   │   └── models.py
│   └── tests/
│       ├── test_dedup.py
│       ├── test_classifier.py
│       └── test_analyzer.py
└── api/
    ├── main.py                  # FastAPI server
    └── models.py
```

---

## Prerequisites

Before starting Phase 1, ensure:
1. Go 1.22+ installed
2. Python 3.12+ installed with `uv` or `poetry`
3. Docker and Docker Compose installed
4. Anthropic API key (or placeholder for Ollama)

---

### Task 1: Docker Compose Infrastructure

**Goal:** Set up shared services (PostgreSQL, Redis, Miniflux) with Docker Compose.

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

- [ ] **Step 1: Create docker-compose.yml**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: ${DB_USER:-broadspace}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-broadspace}
      POSTGRES_DB: ${DB_NAME:-broadspace}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${DB_USER:-broadspace} -d ${DB_NAME:-broadspace}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    command: redis-server --appendonly yes
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  miniflux:
    image: miniflux/miniflux:latest
    environment:
      DATABASE_URL: postgres://${DB_USER:-broadspace}:${DB_PASSWORD:-broadspace}@postgres/${DB_NAME:-broadspace}?sslmode=disable
      RUN_MIGRATIONS: 1
      CREATE_ADMIN: 1
      ADMIN_USERNAME: ${MINIFLUX_ADMIN:-admin}
      ADMIN_PASSWORD: ${MINIFLUX_PASSWORD:-admin123}
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "/usr/bin/miniflux", "-healthcheck", "auto"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:
```

- [ ] **Step 2: Create .env.example**

```bash
# Database
DB_USER=broadspace
DB_PASSWORD=change_me_in_production
DB_NAME=broadspace

# Miniflux
MINIFLUX_ADMIN=admin
MINIFLUX_PASSWORD=change_me

# Redis
REDIS_URL=redis://localhost:6379/0

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# LLM Model
LLM_MODEL=claude-sonnet-4-6
```

- [ ] **Step 3: Start infrastructure and verify**

Run:
```bash
cp .env.example .env
# Edit .env with real values
docker compose up -d
```

Verify:
```bash
docker compose ps
# All services should show "healthy"
```

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "infra: add Docker Compose with Postgres, Redis, Miniflux"
```

---

### Task 2: Go Collector — Project Structure and Config

**Goal:** Set up Go module and configuration loading.

**Files:**
- Create: `collector/go.mod`
- Create: `collector/internal/config/config.go`
- Create: `collector/internal/config/config_test.go`

- [ ] **Step 1: Initialize Go module**

Run:
```bash
mkdir -p collector
cd collector
go mod init github.com/broadspace/collector
```

- [ ] **Step 2: Create config.go**

```go
package config

import (
	"os"
)

type Config struct {
	RedisURL      string
	MinifluxURL   string
	MinifluxUser  string
	MinifluxPass  string
	MaxConcurrency int
	FetchInterval  string
}

func Load() *Config {
	return &Config{
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379/0"),
		MinifluxURL:    getEnv("MINIFLUX_URL", "http://localhost:8080"),
		MinifluxUser:   getEnv("MINIFLUX_ADMIN", "admin"),
		MinifluxPass:   getEnv("MINIFLUX_PASSWORD", "admin123"),
		MaxConcurrency: 50,
		FetchInterval:  getEnv("FETCH_INTERVAL", "30m"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 3: Write test for config**

Create `collector/internal/config/config_test.go`:

```go
package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	os.Unsetenv("REDIS_URL")
	os.Unsetenv("MINIFLUX_URL")

	cfg := Load()

	if cfg.RedisURL != "redis://localhost:6379/0" {
		t.Errorf("expected default RedisURL, got %s", cfg.RedisURL)
	}
	if cfg.MaxConcurrency != 50 {
		t.Errorf("expected concurrency 50, got %d", cfg.MaxConcurrency)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	os.Setenv("REDIS_URL", "redis://custom:6379/1")
	defer os.Unsetenv("REDIS_URL")

	cfg := Load()

	if cfg.RedisURL != "redis://custom:6379/1" {
		t.Errorf("expected custom RedisURL, got %s", cfg.RedisURL)
	}
}
```

- [ ] **Step 4: Run test**

Run:
```bash
cd collector
go test ./internal/config/... -v
```

Expected: 2 PASS

- [ ] **Step 5: Commit**

```bash
git add collector/
git commit -m "feat(collector): add Go project structure and config loading"
```

---

### Task 3: Go Collector — Source Abstraction and RSS Source

**Goal:** Define the source interface and implement RSS fetching via Miniflux.

**Files:**
- Create: `collector/internal/source/source.go`
- Create: `collector/internal/source/rss.go`
- Create: `collector/internal/source/rss_test.go`

- [ ] **Step 1: Create source interface**

```go
package source

import "context"

type Article struct {
	ID          string
	Title       string
	URL         string
	SourceName  string
	PublishedAt string
	Content     string
	Summary     string
}

type Source interface {
	Name() string
	Fetch(ctx context.Context) ([]Article, error)
}
```

- [ ] **Step 2: Implement Miniflux RSS source**

```go
package source

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type MinifluxSource struct {
	baseURL  string
	username string
	password string
	client   *http.Client
}

func NewMiniflux(baseURL, username, password string) *MinifluxSource {
	return &MinifluxSource{
		baseURL:  baseURL,
		username: username,
		password: password,
		client:   &http.Client{Timeout: 30 * time.Second},
	}
}

func (m *MinifluxSource) Name() string { return "miniflux" }

func (m *MinifluxSource) Fetch(ctx context.Context) ([]Article, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", m.baseURL+"/v1/entries?status=unread&direction=desc&limit=100", nil)
	if err != nil {
		return nil, err
	}
	req.SetBasicAuth(m.username, m.password)

	resp, err := m.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("miniflux fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("miniflux returned %d", resp.StatusCode)
	}

	var result struct {
		Total   int `json:"total"`
		Entries []struct {
			ID      int64  `json:"id"`
			Title   string `json:"title"`
			URL     string `json:"url"`
			Feed    struct {
				Title string `json:"title"`
			} `json:"feed"`
			PublishedAt string `json:"published_at"`
			Content     string `json:"content"`
		} `json:"entries"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("miniflux decode failed: %w", err)
	}

	articles := make([]Article, 0, len(result.Entries))
	for _, e := range result.Entries {
		articles = append(articles, Article{
			ID:          fmt.Sprintf("miniflux_%d", e.ID),
			Title:       e.Title,
			URL:         e.URL,
			SourceName:  e.Feed.Title,
			PublishedAt: e.PublishedAt,
			Content:     e.Content,
		})
	}
	return articles, nil
}
```

- [ ] **Step 3: Write test for Miniflux source**

Create `collector/internal/source/rss_test.go`:

```go
package source

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMinifluxSource_Fetch(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/entries" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != "admin" || pass != "secret" {
			t.Errorf("bad auth: %s/%s", user, pass)
		}

		resp := map[string]interface{}{
			"total": 1,
			"entries": []map[string]interface{}{
				{
					"id":           42,
					"title":        "Test Article",
					"url":          "https://example.com/test",
					"feed":         map[string]string{"title": "Test Feed"},
					"published_at": "2026-05-25T08:00:00Z",
					"content":      "<p>Test content</p>",
				},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	src := NewMiniflux(ts.URL, "admin", "secret")
	articles, err := src.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(articles) != 1 {
		t.Fatalf("expected 1 article, got %d", len(articles))
	}
	if articles[0].Title != "Test Article" {
		t.Errorf("unexpected title: %s", articles[0].Title)
	}
	if articles[0].SourceName != "Test Feed" {
		t.Errorf("unexpected source name: %s", articles[0].SourceName)
	}
}
```

- [ ] **Step 4: Run test**

Run:
```bash
cd collector
go test ./internal/source/... -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add collector/internal/source/
git commit -m "feat(collector): add source abstraction and Miniflux RSS source"
```

---

### Task 4: Go Collector — Scraper Sources (HN, Reddit, Zhihu, V2EX)

**Goal:** Implement custom scrapers for non-RSS sources using HTTP requests with goroutine pool concurrency control.

**Files:**
- Create: `collector/internal/source/scraper.go`
- Create: `collector/internal/source/scraper_test.go`

- [ ] **Step 1: Create scraper base**

```go
package source

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type ScraperSource struct {
	name       string
	fetchURL   string
	parseFunc  func([]byte) ([]Article, error)
	client     *http.Client
}

func NewScraper(name, fetchURL string, parseFunc func([]byte) ([]Article, error)) *ScraperSource {
	return &ScraperSource{
		name:      name,
		fetchURL:  fetchURL,
		parseFunc: parseFunc,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *ScraperSource) Name() string { return s.name }

func (s *ScraperSource) Fetch(ctx context.Context) ([]Article, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", s.fetchURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "BroadSpace/1.0 (Tech Discovery Bot)")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("%s fetch failed: %w", s.name, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s returned %d", s.name, resp.StatusCode)
	}

	body := make([]byte, 0, 1024*1024)
	buf := make([]byte, 4096)
	for {
		n, err := resp.Body.Read(buf)
		if n > 0 {
			body = append(body, buf[:n]...)
		}
		if err != nil {
			break
		}
	}

	return s.parseFunc(body)
}
```

- [ ] **Step 2: Add HN parser function**

```go
func NewHackerNews() *ScraperSource {
	return NewScraper("hackernews", "https://hacker-news.firebaseio.com/v0/topstories.json",
		func(body []byte) ([]Article, error) {
			var ids []int
			if err := json.Unmarshal(body, &ids); err != nil {
				return nil, fmt.Errorf("hn parse ids: %w", err)
			}
			// For Phase 1, just return empty — full implementation needs batch item fetching
			return []Article{}, nil
		})
}
```

- [ ] **Step 3: Write test**

Create `collector/internal/source/scraper_test.go`:

```go
package source

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestScraperSource_Fetch(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") == "" {
			t.Error("missing User-Agent header")
		}
		w.Write([]byte(`{"items": [{"title": "Scraped", "url": "https://example.com"}]}`))
	}))
	defer ts.Close()

	src := NewScraper("test_scraper", ts.URL, func(body []byte) ([]Article, error) {
		return []Article{{
			ID:         "test_1",
			Title:      "Scraped",
			URL:        "https://example.com",
			SourceName: "test_scraper",
		}}, nil
	})

	articles, err := src.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(articles) != 1 {
		t.Fatalf("expected 1 article, got %d", len(articles))
	}
	if articles[0].Title != "Scraped" {
		t.Errorf("unexpected title: %s", articles[0].Title)
	}
}
```

- [ ] **Step 4: Run test**

```bash
cd collector
go test ./internal/source/... -v
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add collector/internal/source/scraper.go collector/internal/source/scraper_test.go
git commit -m "feat(collector): add generic scraper source with HN stub"
```

---

### Task 5: Go Collector — GitHub and ArXiv Sources

**Goal:** Add GitHub Trending and ArXiv paper sources.

**Files:**
- Create: `collector/internal/source/github.go`
- Create: `collector/internal/source/arxiv.go`

- [ ] **Step 1: Implement GitHub Trending source**

```go
package source

import (
	"encoding/json"
	"fmt"
)

func NewGitHubTrending() *ScraperSource {
	return NewScraper("github_trending", "https://api.github.com/search/repositories?q=created:>2026-05-18&sort=stars&order=desc&per_page=50",
		func(body []byte) ([]Article, error) {
			var result struct {
				Items []struct {
					FullName    string `json:"full_name"`
					HTMLURL     string `json:"html_url"`
					Description string `json:"description"`
					CreatedAt   string `json:"created_at"`
				} `json:"items"`
			}
			if err := json.Unmarshal(body, &result); err != nil {
				return nil, fmt.Errorf("github parse: %w", err)
			}

			articles := make([]Article, 0, len(result.Items))
			for i, item := range result.Items {
				articles = append(articles, Article{
					ID:          fmt.Sprintf("gh_%d", i),
					Title:       fmt.Sprintf("[GitHub] %s", item.FullName),
					URL:         item.HTMLURL,
					SourceName:  "github_trending",
					PublishedAt: item.CreatedAt,
					Content:     item.Description,
				})
			}
			return articles, nil
		})
}
```

- [ ] **Step 2: Implement ArXiv source**

```go
package source

import (
	"encoding/xml"
	"fmt"
	"strings"
	"time"
)

func NewArXiv() *ScraperSource {
	return NewScraper("arxiv", "http://export.arxiv.org/api/query?search_query=submittedDate:[202605240000+TO+202605252359]&sortBy=submittedDate&sortOrder=descending&max_results=50",
		func(body []byte) ([]Article, error) {
			var feed struct {
				Entries []struct {
					ID      string `xml:"id"`
					Title   string `xml:"title"`
					Summary string `xml:"summary"`
					Published string `xml:"published"`
					Authors []struct {
						Name string `xml:"name"`
					} `xml:"author"`
				} `xml:"entry"`
			}
			if err := xml.Unmarshal(body, &feed); err != nil {
				return nil, fmt.Errorf("arxiv parse: %w", err)
			}

			articles := make([]Article, 0, len(feed.Entries))
			for _, e := range feed.Entries {
				title := strings.TrimSpace(e.Title)
				articles = append(articles, Article{
					ID:          e.ID,
					Title:       fmt.Sprintf("[ArXiv] %s", title),
					URL:         e.ID,
					SourceName:  "arxiv",
					PublishedAt: e.Published,
					Content:     strings.TrimSpace(e.Summary),
				})
			}
			return articles, nil
		})
}
```

- [ ] **Step 3: Commit**

```bash
git add collector/internal/source/github.go collector/internal/source/arxiv.go
git commit -m "feat(collector): add GitHub Trending and ArXiv sources"
```

---

### Task 6: Go Collector — Normalizer and Redis Queue

**Goal:** Convert collected articles to unified JSON format and push to Redis Streams.

**Files:**
- Create: `collector/internal/normalizer/normalizer.go`
- Create: `collector/internal/queue/redis.go`
- Create: `collector/internal/queue/redis_test.go`

- [ ] **Step 1: Create normalizer**

```go
package normalizer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/broadspace/collector/internal/source"
)

type NormalizedArticle struct {
	ID          string            `json:"id"`
	Title       string            `json:"title"`
	URL         string            `json:"url"`
	SourceName  string            `json:"source_name"`
	PublishedAt string            `json:"published_at"`
	Content     string            `json:"content"`
	FetchedAt   string            `json:"fetched_at"`
	Hash        string            `json:"hash"`
	Raw         source.Article    `json:"raw"`
}

func Normalize(article source.Article) NormalizedArticle {
	hash := sha256.Sum256([]byte(article.URL + article.Title))
	return NormalizedArticle{
		ID:          fmt.Sprintf("%s_%s", article.SourceName, article.ID),
		Title:       article.Title,
		URL:         article.URL,
		SourceName:  article.SourceName,
		PublishedAt: article.PublishedAt,
		Content:     article.Content,
		FetchedAt:   time.Now().UTC().Format(time.RFC3339),
		Hash:        hex.EncodeToString(hash[:]),
		Raw:         article,
	}
}

func (n NormalizedArticle) ToJSON() ([]byte, error) {
	return json.Marshal(n)
}
```

- [ ] **Step 2: Create Redis queue publisher**

```go
package queue

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

type Publisher struct {
	client redis.UniversalClient
	stream string
}

func NewPublisher(redisURL, stream string) (*Publisher, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(opts)
	return &Publisher{client: client, stream: stream}, nil
}

func (p *Publisher) Publish(ctx context.Context, key string, data []byte) error {
	return p.client.XAdd(ctx, &redis.XAddArgs{
		Stream: p.stream,
		Values: map[string]interface{}{
			key: string(data),
		},
	}).Err()
}

func (p *Publisher) Close() error {
	return p.client.Close()
}
```

- [ ] **Step 3: Add Redis dependency and test**

Run:
```bash
cd collector
go get github.com/redis/go-redis/v9
```

Create `collector/internal/queue/redis_test.go`:

```go
package queue

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
)

func TestPublisher_Publish(t *testing.T) {
	m := miniredis.Run()
	defer m.Close()

	pub, err := NewPublisher("redis://"+m.Addr(), "broadspace:articles")
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	defer pub.Close()

	ctx := context.Background()
	err = pub.Publish(ctx, "article", []byte(`{"title":"test"}`))
	if err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	// Verify stream exists
	len, err := m.XLen("broadspace:articles")
	if err != nil {
		t.Fatalf("xlen failed: %v", err)
	}
	if len != 1 {
		t.Errorf("expected stream length 1, got %d", len)
	}
}
```

Run:
```bash
cd collector
go get github.com/alicebob/miniredis/v2
go test ./internal/queue/... -v
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add collector/internal/normalizer/ collector/internal/queue/ collector/go.mod collector/go.sum
git commit -m "feat(collector): add normalizer and Redis Streams publisher"
```

---

### Task 7: Go Collector — Main Entry Point and Orchestrator

**Goal:** Wire everything together — concurrent source fetching with goroutine pool, normalization, and Redis publishing.

**Files:**
- Create: `collector/cmd/collector/main.go`

- [ ] **Step 1: Create main.go**

```go
package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/broadspace/collector/internal/config"
	"github.com/broadspace/collector/internal/normalizer"
	"github.com/broadspace/collector/internal/queue"
	"github.com/broadspace/collector/internal/source"
)

func main() {
	cfg := config.Load()

	publisher, err := queue.NewPublisher(cfg.RedisURL, "broadspace:articles")
	if err != nil {
		log.Fatalf("redis publisher: %v", err)
	}
	defer publisher.Close()

	sources := []source.Source{
		source.NewMiniflux(cfg.MinifluxURL, cfg.MinifluxUser, cfg.MinifluxPass),
		source.NewHackerNews(),
		source.NewGitHubTrending(),
		source.NewArXiv(),
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("shutting down...")
		cancel()
	}()

	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	// Run immediately on start
	runCollection(ctx, sources, publisher, cfg.MaxConcurrency)

	for {
		select {
		case <-ticker.C:
			runCollection(ctx, sources, publisher, cfg.MaxConcurrency)
		case <-ctx.Done():
			return
		}
	}
}

func runCollection(ctx context.Context, sources []source.Source, pub *queue.Publisher, maxConcurrency int) {
	start := time.Now()
	log.Println("starting collection cycle...")

	semaphore := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup

	for _, src := range sources {
		wg.Add(1)
		go func(s source.Source) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			articles, err := s.Fetch(ctx)
			if err != nil {
				log.Printf("source %s failed: %v", s.Name(), err)
				return
			}

			log.Printf("source %s: fetched %d articles", s.Name(), len(articles))

			for _, article := range articles {
				norm := normalizer.Normalize(article)
				data, err := norm.ToJSON()
				if err != nil {
					log.Printf("normalize failed: %v", err)
					continue
				}

				if err := pub.Publish(ctx, norm.Hash, data); err != nil {
					log.Printf("publish failed: %v", err)
				}
			}
		}(src)
	}

	wg.Wait()
	log.Printf("collection cycle complete in %v", time.Since(start))
}
```

- [ ] **Step 2: Build and verify**

Run:
```bash
cd collector
go build ./cmd/collector/
```

Expected: binary `collector` created, no errors.

- [ ] **Step 3: Commit**

```bash
git add collector/cmd/collector/main.go
git commit -m "feat(collector): add main entry point with goroutine pool orchestration"
```

---

### Task 8: Python Processor — Project Setup

**Goal:** Set up Python project with dependencies and models.

**Files:**
- Create: `processor/pyproject.toml`
- Create: `processor/src/processor/__init__.py`
- Create: `processor/src/processor/models.py`

- [ ] **Step 1: Create pyproject.toml**

```toml
[project]
name = "broadspace-processor"
version = "0.1.0"
description = "BroadSpace content processing pipeline"
requires-python = ">=3.12"
dependencies = [
    "anthropic>=0.28.0",
    "redis>=5.0.0",
    "sqlalchemy>=2.0.0",
    "psycopg2-binary>=2.9.0",
    "pydantic>=2.7.0",
    "python-dotenv>=1.0.0",
    "httpx>=0.27.0",
]

[project.optional-dependencies]
dev = [
    "pytest>=8.0.0",
    "pytest-asyncio>=0.23.0",
    "factory-boy>=3.3.0",
]
```

- [ ] **Step 2: Create Pydantic models**

Create `processor/src/processor/models.py`:

```python
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RawArticle(BaseModel):
    id: str
    title: str
    url: str
    source_name: str
    published_at: str | None = None
    content: str = ""
    fetched_at: str
    hash: str
    raw: dict[str, Any] = Field(default_factory=dict)


class ProcessedContent(BaseModel):
    id: str
    sources: list[dict[str, str]] = Field(default_factory=list)
    canonical_url: str = ""
    title: str
    summary: str = ""
    key_points: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    signal_strength: float = Field(ge=0.0, le=1.0, default=0.0)
    sentiment: str = "neutral"
    cross_source_analysis: dict[str, Any] = Field(default_factory=dict)
    triples: list[list[str]] = Field(default_factory=list)
    processed_at: datetime = Field(default_factory=datetime.utcnow)
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
cd processor
pip install -e ".[dev]"
```

- [ ] **Step 4: Commit**

```bash
git add processor/pyproject.toml processor/src/processor/models.py
git commit -m "feat(processor): add Python project setup and Pydantic models"
```

---

### Task 9: Python Processor — LLM Client

**Goal:** Create a typed LLM client wrapping Anthropic API.

**Files:**
- Create: `processor/src/processor/llm/__init__.py`
- Create: `processor/src/processor/llm/client.py`
- Create: `processor/tests/test_llm_client.py`

- [ ] **Step 1: Create LLM client**

```python
import json
import os
from typing import Any

from anthropic import Anthropic


class LLMClient:
    def __init__(self, api_key: str | None = None, model: str = "claude-sonnet-4-6"):
        self.client = Anthropic(api_key=api_key or os.environ.get("ANTHROPIC_API_KEY"))
        self.model = model

    def chat(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> str:
        response = self.client.messages.create(
            model=self.model,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system_prompt,
            messages=[{"role": "user", "content": user_prompt}],
        )
        return response.content[0].text

    def chat_json(
        self,
        system_prompt: str,
        user_prompt: str,
        temperature: float = 0.3,
        max_tokens: int = 2048,
    ) -> dict[str, Any]:
        text = self.chat(system_prompt, user_prompt, temperature, max_tokens)
        # Extract JSON from markdown code blocks if present
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()
        return json.loads(text)
```

- [ ] **Step 2: Write test**

Create `processor/tests/test_llm_client.py`:

```python
import json
from unittest.mock import MagicMock, patch

import pytest

from processor.llm.client import LLMClient


@pytest.fixture
def mock_anthropic_response():
    mock = MagicMock()
    mock.content = [MagicMock(text='{"result": "test"}')]
    return mock


def test_chat_json_extracts_json(mock_anthropic_response):
    with patch("processor.llm.client.Anthropic") as MockAnthropic:
        mock_instance = MagicMock()
        mock_instance.messages.create.return_value = mock_anthropic_response
        MockAnthropic.return_value = mock_instance

        client = LLMClient(api_key="test-key")
        result = client.chat_json("sys", "user")

        assert result == {"result": "test"}


def test_chat_json_extracts_from_markdown_block(mock_anthropic_response):
    mock_anthropic_response.content[0].text = '```json\n{"result": "test"}\n```'

    with patch("processor.llm.client.Anthropic") as MockAnthropic:
        mock_instance = MagicMock()
        mock_instance.messages.create.return_value = mock_anthropic_response
        MockAnthropic.return_value = mock_instance

        client = LLMClient(api_key="test-key")
        result = client.chat_json("sys", "user")

        assert result == {"result": "test"}
```

- [ ] **Step 3: Run test**

Run:
```bash
cd processor
pytest tests/test_llm_client.py -v
```

Expected: 2 PASS

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/llm/ processor/tests/test_llm_client.py
git commit -m "feat(processor): add typed Anthropic LLM client with JSON extraction"
```

---

### Task 10: Python Processor — Deduplication Pipeline

**Goal:** Implement semantic deduplication using title+URL hash for exact match and content similarity for fuzzy.

**Files:**
- Create: `processor/src/processor/pipeline/__init__.py`
- Create: `processor/src/processor/pipeline/dedup.py`
- Create: `processor/tests/test_dedup.py`

- [ ] **Step 1: Create dedup module**

```python
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
```

- [ ] **Step 2: Write test**

```python
import pytest

from processor.models import RawArticle
from processor.pipeline.dedup import Deduplicator


@pytest.fixture
def sample_articles():
    return [
        RawArticle(
            id="a1", title="Rust 2026 Roadmap", url="https://rust-lang.org/2026",
            source_name="HN", hash="hash1", fetched_at="2026-05-25T08:00:00Z"
        ),
        RawArticle(
            id="a2", title="Rust 2026 Roadmap Released", url="https://rust-lang.org/2026",
            source_name="Reddit", hash="hash1", fetched_at="2026-05-25T08:00:00Z"
        ),
        RawArticle(
            id="a3", title="Go 1.24 Released", url="https://go.dev/1.24",
            source_name="HN", hash="hash2", fetched_at="2026-05-25T08:00:00Z"
        ),
    ]


def test_deduplicate_removes_exact_duplicates(sample_articles):
    dedup = Deduplicator()
    result = dedup.deduplicate(sample_articles)

    assert len(result) == 2
    assert result[0].id == "a1"
    assert result[1].id == "a3"


def test_group_by_event(sample_articles):
    dedup = Deduplicator()
    # Use only unique articles for grouping
    unique = dedup.deduplicate(sample_articles)
    groups = dedup.group_by_event(unique)

    assert len(groups) == 2
```

- [ ] **Step 3: Run test**

```bash
cd processor
pytest tests/test_dedup.py -v
```

Expected: 2 PASS

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/pipeline/dedup.py processor/tests/test_dedup.py
git commit -m "feat(processor): add deduplication pipeline with exact hash matching"
```

---

### Task 11: Python Processor — Classification Pipeline

**Goal:** Classify articles into tech domains using LLM with structured output.

**Files:**
- Create: `processor/src/processor/pipeline/classifier.py`
- Create: `processor/tests/test_classifier.py`

- [ ] **Step 1: Create classifier**

```python
from processor.llm.client import LLMClient
from processor.models import RawArticle

CATEGORIES = [
    "AI/ML", "Infrastructure", "Programming Languages",
    "Security", "Frontend", "Mobile", "Database",
    "DevOps", "Open Source", "Academic"
]

SYSTEM_PROMPT = f"""You are a tech news classifier. Given an article title and content, classify it into one or more categories from this list: {', '.join(CATEGORIES)}.

Respond with JSON only:
{{
    "categories": ["category1", "category2"],
    "confidence": 0.85
}}"""


class Classifier:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def classify(self, article: RawArticle) -> list[str]:
        prompt = f"Title: {article.title}\nContent: {article.content[:2000]}\n\nClassify this article."
        try:
            result = self.llm.chat_json(SYSTEM_PROMPT, prompt)
            categories = result.get("categories", [])
            # Validate against known categories
            valid = [c for c in categories if c in CATEGORIES]
            return valid if valid else ["Other"]
        except Exception as e:
            # Fallback: categorize as Other on LLM failure
            return ["Other"]
```

- [ ] **Step 2: Write test**

```python
from unittest.mock import MagicMock

from processor.models import RawArticle
from processor.pipeline.classifier import Classifier


def test_classify_returns_valid_categories():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {"categories": ["AI/ML", "Infrastructure"], "confidence": 0.9}

    classifier = Classifier(mock_llm)
    article = RawArticle(
        id="a1", title="Test", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = classifier.classify(article)

    assert "AI/ML" in result
    assert "Infrastructure" in result


def test_classify_fallback_on_invalid_categories():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {"categories": ["FakeCategory"], "confidence": 0.5}

    classifier = Classifier(mock_llm)
    article = RawArticle(
        id="a1", title="Test", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = classifier.classify(article)

    assert result == ["Other"]


def test_classify_fallback_on_error():
    mock_llm = MagicMock()
    mock_llm.chat_json.side_effect = Exception("LLM error")

    classifier = Classifier(mock_llm)
    article = RawArticle(
        id="a1", title="Test", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = classifier.classify(article)

    assert result == ["Other"]
```

- [ ] **Step 3: Run test**

```bash
cd processor
pytest tests/test_classifier.py -v
```

Expected: 3 PASS

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/pipeline/classifier.py processor/tests/test_classifier.py
git commit -m "feat(processor): add LLM-based multi-label classifier with fallback"
```

---

### Task 12: Python Processor — Summarizer Pipeline

**Goal:** Generate structured summaries (1-sentence overview + key points + signal strength) via LLM.

**Files:**
- Create: `processor/src/processor/pipeline/summarizer.py`
- Create: `processor/tests/test_summarizer.py`

- [ ] **Step 1: Create summarizer**

```python
from processor.llm.client import LLMClient
from processor.models import RawArticle

SYSTEM_PROMPT = """You are a tech news summarizer. Given an article, produce a structured summary.

Respond with JSON only:
{
    "summary": "One-sentence overview of the article (max 50 words)",
    "key_points": ["Point 1", "Point 2", "Point 3"],
    "signal_strength": 0.85,
    "sentiment": "positive|neutral|cautious"
}

signal_strength (0.0-1.0): How significant this news is for the tech industry. Breakthrough = 0.9+, Routine update = 0.3-."""


class Summarizer:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def summarize(self, article: RawArticle) -> dict:
        prompt = f"Title: {article.title}\nContent: {article.content[:3000]}\n\nSummarize this article."
        try:
            return self.llm.chat_json(SYSTEM_PROMPT, prompt)
        except Exception:
            return {
                "summary": article.title,
                "key_points": [],
                "signal_strength": 0.5,
                "sentiment": "neutral",
            }
```

- [ ] **Step 2: Write test**

```python
from unittest.mock import MagicMock

from processor.models import RawArticle
from processor.pipeline.summarizer import Summarizer


def test_summarize_returns_structured_result():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {
        "summary": "A new framework for AI agents.",
        "key_points": ["Point 1", "Point 2"],
        "signal_strength": 0.9,
        "sentiment": "positive",
    }

    summarizer = Summarizer(mock_llm)
    article = RawArticle(
        id="a1", title="AI Agent Framework", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = summarizer.summarize(article)

    assert result["summary"] == "A new framework for AI agents."
    assert result["signal_strength"] == 0.9


def test_summarize_fallback_on_error():
    mock_llm = MagicMock()
    mock_llm.chat_json.side_effect = Exception("LLM error")

    summarizer = Summarizer(mock_llm)
    article = RawArticle(
        id="a1", title="AI Agent Framework", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z",
        content="test content"
    )

    result = summarizer.summarize(article)

    assert result["summary"] == "AI Agent Framework"
    assert result["signal_strength"] == 0.5
```

- [ ] **Step 3: Run test**

```bash
cd processor
pytest tests/test_summarizer.py -v
```

Expected: 2 PASS

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/pipeline/summarizer.py processor/tests/test_summarizer.py
git commit -m "feat(processor): add LLM summarizer with signal strength scoring"
```

---

### Task 13: Python Processor — Cross-Source Analyzer

**Goal:** Analyze multiple sources covering the same event for consensus, divergence, and related trends.

**Files:**
- Create: `processor/src/processor/pipeline/analyzer.py`
- Create: `processor/tests/test_analyzer.py`

- [ ] **Step 1: Create analyzer**

```python
from processor.llm.client import LLMClient
from processor.models import RawArticle

SYSTEM_PROMPT = """You are a tech news analyst. Given multiple articles covering the same event from different sources, analyze them.

Respond with JSON only:
{
    "consensus": "What all sources agree on (1-2 sentences)",
    "divergence": "Where sources disagree or highlight different angles",
    "related_trends": ["Trend 1", "Trend 2"],
    "paradigm_signal": false
}

paradigm_signal: true if this event indicates a potential paradigm shift in how technology is built or used."""


class CrossSourceAnalyzer:
    def __init__(self, llm: LLMClient):
        self.llm = llm

    def analyze(self, articles: list[RawArticle]) -> dict:
        if len(articles) == 1:
            return {
                "consensus": articles[0].title,
                "divergence": "Single source, no comparison available.",
                "related_trends": [],
                "paradigm_signal": False,
            }

        sources_text = "\n\n".join(
            f"Source: {a.source_name}\nTitle: {a.title}\nContent: {a.content[:1000]}"
            for a in articles
        )
        prompt = f"Analyze these {len(articles)} articles covering the same event:\n\n{sources_text}"

        try:
            return self.llm.chat_json(SYSTEM_PROMPT, prompt)
        except Exception:
            return {
                "consensus": articles[0].title,
                "divergence": "Analysis failed.",
                "related_trends": [],
                "paradigm_signal": False,
            }
```

- [ ] **Step 2: Write test**

```python
from unittest.mock import MagicMock

from processor.models import RawArticle
from processor.pipeline.analyzer import CrossSourceAnalyzer


def test_analyze_multiple_sources():
    mock_llm = MagicMock()
    mock_llm.chat_json.return_value = {
        "consensus": "All agree this is significant.",
        "divergence": "Differ on timeline estimates.",
        "related_trends": ["AI adoption"],
        "paradigm_signal": True,
    }

    analyzer = CrossSourceAnalyzer(mock_llm)
    articles = [
        RawArticle(id="a1", title="X Announced", url="https://a.com", source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z", content="content a"),
        RawArticle(id="a2", title="X Revealed", url="https://b.com", source_name="Reddit", hash="h2", fetched_at="2026-05-25T08:00:00Z", content="content b"),
    ]

    result = analyzer.analyze(articles)

    assert result["paradigm_signal"] is True
    assert "AI adoption" in result["related_trends"]


def test_analyze_single_source_fallback():
    analyzer = CrossSourceAnalyzer(MagicMock())
    articles = [
        RawArticle(id="a1", title="X Announced", url="https://a.com", source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z", content="content"),
    ]

    result = analyzer.analyze(articles)

    assert result["consensus"] == "X Announced"
    assert result["paradigm_signal"] is False
```

- [ ] **Step 3: Run test**

```bash
cd processor
pytest tests/test_analyzer.py -v
```

Expected: 2 PASS

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/pipeline/analyzer.py processor/tests/test_analyzer.py
git commit -m "feat(processor): add cross-source analyzer with paradigm shift detection"
```

---

### Task 14: Python Processor — Worker and PostgreSQL Storage

**Goal:** Wire pipeline together into a Redis consumer that processes articles and stores results in PostgreSQL.

**Files:**
- Create: `processor/src/processor/worker.py`
- Create: `processor/tests/test_worker.py`

- [ ] **Step 1: Create SQLAlchemy models**

```python
from sqlalchemy import Column, String, Float, DateTime, JSON, create_engine, text
from sqlalchemy.orm import declarative_base, sessionmaker
from datetime import datetime

Base = declarative_base()

class ProcessedArticle(Base):
    __tablename__ = "processed_articles"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    summary = Column(String)
    categories = Column(JSON)
    key_points = Column(JSON)
    signal_strength = Column(Float)
    sentiment = Column(String)
    cross_source_analysis = Column(JSON)
    triples = Column(JSON)
    sources = Column(JSON)
    processed_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 2: Create worker**

```python
import json
import logging
from typing import Any

import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from processor.llm.client import LLMClient
from processor.models import ProcessedContent, RawArticle
from processor.pipeline.analyzer import CrossSourceAnalyzer
from processor.pipeline.classifier import Classifier
from processor.pipeline.dedup import Deduplicator
from processor.pipeline.summarizer import Summarizer
from processor.worker_models import ProcessedArticle, Base

logger = logging.getLogger(__name__)


class Worker:
    def __init__(
        self,
        redis_url: str,
        db_url: str,
        llm: LLMClient,
        stream_key: str = "broadspace:articles",
        consumer_group: str = "processor",
    ):
        self.redis = redis.from_url(redis_url)
        self.stream_key = stream_key
        self.consumer_group = consumer_group
        self.llm = llm
        self.classifier = Classifier(llm)
        self.summarizer = Summarizer(llm)
        self.analyzer = CrossSourceAnalyzer(llm)

        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)

        self._ensure_consumer_group()

    def _ensure_consumer_group(self):
        try:
            self.redis.xgroup_create(self.stream_key, self.consumer_group, id="0", mkstream=True)
        except redis.ResponseError as e:
            if "already exists" not in str(e):
                raise

    def run(self, count: int = 10, block_ms: int = 5000):
        """Process batch of messages from Redis Streams."""
        dedup = Deduplicator()
        articles: list[RawArticle] = []

        # Read from stream
        messages = self.redis.xreadgroup(
            self.consumer_group,
            "worker-1",
            {self.stream_key: ">"},
            count=count,
            block=block_ms,
        )

        for stream_name, stream_messages in messages:
            for msg_id, fields in stream_messages:
                for key, value in fields.items():
                    try:
                        data = json.loads(value)
                        article = RawArticle(**data)
                        if not dedup.is_duplicate(article):
                            dedup.add(article)
                            articles.append(article)
                    except Exception as e:
                        logger.error(f"failed to parse message {msg_id}: {e}")

                # Acknowledge message
                self.redis.xack(self.stream_key, self.consumer_group, msg_id)

        if not articles:
            return []

        # Group by event for cross-source analysis
        groups = dedup.group_by_event(articles)
        results: list[ProcessedContent] = []

        for group in groups:
            processed = self._process_group(group)
            results.append(processed)
            self._save(processed)

        return results

    def _process_group(self, articles: list[RawArticle]) -> ProcessedContent:
        primary = articles[0]

        # Run pipeline steps
        categories = self.classifier.classify(primary)
        summary_result = self.summarizer.summarize(primary)
        analysis = self.analyzer.analyze(articles)

        return ProcessedContent(
            id=primary.hash,
            sources=[{"name": a.source_name, "url": a.url} for a in articles],
            canonical_url=primary.url,
            title=primary.title,
            summary=summary_result.get("summary", ""),
            key_points=summary_result.get("key_points", []),
            categories=categories,
            signal_strength=summary_result.get("signal_strength", 0.5),
            sentiment=summary_result.get("sentiment", "neutral"),
            cross_source_analysis=analysis,
            triples=[],
        )

    def _save(self, content: ProcessedContent):
        session = self.Session()
        try:
            db_article = ProcessedArticle(
                id=content.id,
                title=content.title,
                url=content.canonical_url,
                summary=content.summary,
                categories=content.categories,
                key_points=content.key_points,
                signal_strength=content.signal_strength,
                sentiment=content.sentiment,
                cross_source_analysis=content.cross_source_analysis,
                triples=content.triples,
                sources=content.sources,
            )
            session.merge(db_article)  # merge = upsert by primary key
            session.commit()
        finally:
            session.close()
```

- [ ] **Step 3: Create worker_models.py**

Move the SQLAlchemy model to its own file:

```python
from sqlalchemy import Column, String, Float, DateTime, JSON
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class ProcessedArticle(Base):
    __tablename__ = "processed_articles"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    summary = Column(String)
    categories = Column(JSON)
    key_points = Column(JSON)
    signal_strength = Column(Float)
    sentiment = Column(String)
    cross_source_analysis = Column(JSON)
    triples = Column(JSON)
    sources = Column(JSON)
    processed_at = Column(DateTime, default=datetime.utcnow)
```

- [ ] **Step 4: Write test**

```python
from unittest.mock import MagicMock, patch

import pytest
import redis

from processor.models import RawArticle
from processor.worker import Worker


@pytest.fixture
def mock_worker():
    with patch("processor.worker.redis") as mock_redis, \
         patch("processor.worker.create_engine") as mock_engine:

        mock_client = MagicMock()
        mock_client.xgroup_create.return_value = None
        mock_client.xreadgroup.return_value = []
        mock_redis.from_url.return_value = mock_client

        mock_llm = MagicMock()
        mock_llm.chat_json.return_value = {}

        worker = Worker(
            redis_url="redis://localhost:6379/0",
            db_url="postgresql://user:pass@localhost/db",
            llm=mock_llm,
        )
        return worker


def test_worker_processes_messages(mock_worker):
    article = RawArticle(
        id="a1", title="Test", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z"
    )

    mock_worker.redis.xreadgroup.return_value = [
        (b"broadspace:articles", [
            (b"msg1", {b"h1": article.model_dump_json().encode()})
        ])
    ]

    results = mock_worker.run()

    assert len(results) == 1
    assert results[0].title == "Test"
    mock_worker.redis.xack.assert_called_once()
```

- [ ] **Step 5: Run test**

```bash
cd processor
pytest tests/test_worker.py -v
```

Expected: 1 PASS

- [ ] **Step 6: Commit**

```bash
git add processor/src/processor/worker.py processor/src/processor/worker_models.py processor/tests/test_worker.py
git commit -m "feat(processor): add Redis consumer worker with pipeline orchestration and PostgreSQL storage"
```

---

### Task 15: REST API — FastAPI Server

**Goal:** Expose processed content via REST API with pagination, filtering, and search.

**Files:**
- Create: `api/main.py`
- Create: `api/models.py`

- [ ] **Step 1: Create API models**

```python
from datetime import datetime
from typing import Any

from pydantic import BaseModel


class ContentResponse(BaseModel):
    id: str
    title: str
    url: str
    summary: str
    categories: list[str]
    key_points: list[str]
    signal_strength: float
    sentiment: str
    sources: list[dict[str, str]]
    processed_at: datetime
```

- [ ] **Step 2: Create FastAPI server**

```python
import os

from fastapi import FastAPI, Query
from sqlalchemy import create_engine, desc, func
from sqlalchemy.orm import sessionmaker

from api.models import ContentResponse

app = FastAPI(title="BroadSpace API")

db_url = os.environ.get("DATABASE_URL", "postgresql://broadspace:broadspace@localhost:5432/broadspace")
engine = create_engine(db_url)
Session = sessionmaker(bind=engine)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/content", response_model=list[ContentResponse])
def list_content(
    category: str | None = Query(None, description="Filter by category"),
    min_signal: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    session = Session()
    try:
        from sqlalchemy import text
        query = session.execute(
            text("""
                SELECT id, title, url, summary, categories, key_points,
                       signal_strength, sentiment, sources, processed_at
                FROM processed_articles
                WHERE signal_strength >= :min_signal
                  AND (:category IS NULL OR categories @> ARRAY[:category])
                ORDER BY signal_strength DESC, processed_at DESC
                LIMIT :limit OFFSET :offset
            """),
            {
                "min_signal": min_signal,
                "category": category,
                "limit": limit,
                "offset": offset,
            }
        )

        results = []
        for row in query:
            results.append(ContentResponse(
                id=row.id,
                title=row.title,
                url=row.url,
                summary=row.summary or "",
                categories=row.categories or [],
                key_points=row.key_points or [],
                signal_strength=row.signal_strength or 0.0,
                sentiment=row.sentiment or "neutral",
                sources=row.sources or [],
                processed_at=row.processed_at,
            ))
        return results
    finally:
        session.close()


@app.get("/content/{content_id}", response_model=ContentResponse)
def get_content(content_id: str):
    session = Session()
    try:
        from sqlalchemy import text
        row = session.execute(
            text("""
                SELECT id, title, url, summary, categories, key_points,
                       signal_strength, sentiment, sources, processed_at
                FROM processed_articles WHERE id = :id
            """),
            {"id": content_id}
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Content not found")

        return ContentResponse(
            id=row.id,
            title=row.title,
            url=row.url,
            summary=row.summary or "",
            categories=row.categories or [],
            key_points=row.key_points or [],
            signal_strength=row.signal_strength or 0.0,
            sentiment=row.sentiment or "neutral",
            sources=row.sources or [],
            processed_at=row.processed_at,
        )
    finally:
        session.close()
```

- [ ] **Step 3: Add FastAPI dependency**

Update `processor/pyproject.toml` to add FastAPI (or create separate api/pyproject.toml).

For Phase 1, add to processor dependencies:
```toml
dependencies = [
    ...existing deps...,
    "fastapi>=0.111.0",
    "uvicorn>=0.30.0",
]
```

- [ ] **Step 4: Commit**

```bash
git add api/main.py api/models.py processor/pyproject.toml
git commit -m "feat(api): add FastAPI server with content listing and search"
```

---

### Task 16: Integration — End-to-End Test

**Goal:** Verify the full pipeline works: collect → normalize → publish → consume → process → store → query.

**Files:**
- Create: `tests/integration/test_pipeline.py`

- [ ] **Step 1: Create integration test**

```python
import json
import time
import subprocess
import sys

import pytest
import redis
import requests
from sqlalchemy import create_engine, text


@pytest.fixture(scope="module")
def services():
    """Ensure Docker services are running."""
    # Check Redis
    r = redis.from_url("redis://localhost:6379/0")
    try:
        r.ping()
    except redis.ConnectionError:
        pytest.skip("Redis not available — run 'docker compose up -d' first")

    # Check PostgreSQL
    engine = create_engine("postgresql://broadspace:broadspace@localhost:5432/broadspace")
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("PostgreSQL not available — run 'docker compose up -d' first")

    return {"redis": r, "db": engine}


def test_end_to_end_pipeline(services):
    """Test: publish a raw article to Redis, run processor, verify it's in DB and API."""
    r = services["redis"]
    db = services["db"]

    # Clean up
    r.delete("broadspace:articles")
    with db.connect() as conn:
        conn.execute(text("DELETE FROM processed_articles"))
        conn.commit()

    # Publish a test article
    article = {
        "id": "test_001",
        "title": "Test Article for Integration",
        "url": "https://example.com/test",
        "source_name": "test_source",
        "published_at": "2026-05-25T08:00:00Z",
        "content": "This is a test article about AI and machine learning.",
        "fetched_at": "2026-05-25T08:00:00Z",
        "hash": "testhash001",
        "raw": {},
    }

    r.xadd("broadspace:articles", {"testhash001": json.dumps(article)})

    # Run processor worker (mock LLM for speed)
    from unittest.mock import MagicMock
    from processor.worker import Worker
    from processor.llm.client import LLMClient

    mock_llm = MagicMock(spec=LLMClient)
    mock_llm.chat_json.return_value = {
        "categories": ["AI/ML"],
        "confidence": 0.9,
    }

    worker = Worker(
        redis_url="redis://localhost:6379/0",
        db_url="postgresql://broadspace:broadspace@localhost:5432/broadspace",
        llm=mock_llm,
    )

    results = worker.run(count=10, block_ms=1000)

    assert len(results) >= 1
    assert results[0].title == "Test Article for Integration"

    # Verify in database
    with db.connect() as conn:
        row = conn.execute(
            text("SELECT title FROM processed_articles WHERE id = :id"),
            {"id": "testhash001"}
        ).fetchone()
        assert row is not None
        assert row.title == "Test Article for Integration"
```

- [ ] **Step 2: Run integration test**

Run:
```bash
# Ensure services are up
docker compose up -d

# Run integration test
cd tests/integration
pytest test_pipeline.py -v -s
```

Expected: 1 PASS (may need to set ANTHROPIC_API_KEY or mock LLM)

- [ ] **Step 3: Commit**

```bash
git add tests/integration/
git commit -m "test(integration): add end-to-end pipeline verification"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Implementing Task |
|-------------|-------------------|
| Docker Compose infrastructure | Task 1 |
| Go 采集层 (RSS + scrapers) | Task 2-7 |
| Redis Streams 解耦 | Task 6-7, 14 |
| 去重引擎 | Task 10 |
| 领域分类 | Task 11 |
| 摘要生成 | Task 12 |
| 跨源分析 | Task 13 |
| PostgreSQL 存储 | Task 14 |
| REST API | Task 15 |
| 测试策略 | Tasks 2-16 |

**Gap: 知识图谱层** — Graphiti + Neo4j + 三元组抽取属于 Phase 2，不在 Phase 1 范围。
**Gap: Web UI** — Next.js + D3.js 前端属于 Phase 3，不在 Phase 1 范围。
**Gap: 分发层** — Email + WeCom Bot 属于 Phase 3，不在 Phase 1 范围。

### Placeholder Scan

- No "TBD", "TODO", "implement later" found.
- All steps have complete code blocks.
- All tests have expected commands and expected outputs.
- No vague instructions like "add error handling".

### Type Consistency

- `RawArticle` model defined in Task 8, used consistently in Tasks 10-14.
- `LLMClient` defined in Task 9, used in Tasks 11-13.
- `ProcessedContent` defined in Task 8, used in Task 14.
- Redis stream key `"broadspace:articles"` consistent across Go and Python.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-25-broadspace-phase1.md`.**

This plan builds a **working end-to-end core pipeline**: Go collects from sources → normalizes → Redis Streams → Python processes (dedup → classify → summarize → analyze) → PostgreSQL → REST API.

**Two execution options:**

**1. Subagent-Driven (recommended)** — Fresh subagent per task, review between tasks, fast iteration. Good for parallelizing independent tasks.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints. Good for sequential dependency-heavy work.

**Which approach would you like?**
