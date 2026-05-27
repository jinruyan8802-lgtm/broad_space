# Data Sources Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 3 broken data sources (HN, ArXiv, V2EX) and add 4 new sources (Juejin, Lobsters, Dev.to, 36Kr) so BroadSpace collects from 9 sources instead of 2.

**Architecture:** All sources implement the `source.Source` interface (`Name() string`, `Fetch(ctx) ([]Article, error)`). Simple GET+JSON sources use `NewScraper()`. Sources needing POST or multi-step fetching get custom structs. Each source is one `.go` file under `collector/internal/source/`.

**Tech Stack:** Go, net/http, encoding/json, encoding/xml, sync (goroutines), context

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `collector/internal/source/scraper.go` | Modify | Add retry to `ScraperSource.Fetch`; rewrite `NewHackerNews` to a dedicated `hn.go` |
| `collector/internal/source/hn.go` | Create | HackerNews: fetch top story IDs → fetch each item concurrently |
| `collector/internal/source/arxiv.go` | Modify | Dynamic date range instead of hardcoded |
| `collector/internal/source/juejin.go` | Create | Juejin: POST JSON API |
| `collector/internal/source/lobsters.go` | Create | Lobsters: GET JSON API |
| `collector/internal/source/devto.go` | Create | Dev.to: GET JSON API |
| `collector/internal/source/kr36.go` | Create | 36Kr: RSS XML |
| `collector/cmd/collector/main.go` | Modify | Add new sources to sources slice |
| `collector/internal/source/source_test.go` | Create | Unit tests for new sources (parse functions) |

---

### Task 1: Add retry logic to ScraperSource.Fetch

**Files:**
- Modify: `collector/internal/source/scraper.go:29-59`

The current `Fetch` makes one HTTP request and fails immediately on error. V2EX and other sources may be flaky. Add retry with backoff.

- [ ] **Step 1: Add retry loop to Fetch**

Replace `ScraperSource.Fetch` in `collector/internal/source/scraper.go`:

```go
func (s *ScraperSource) Fetch(ctx context.Context) ([]Article, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			time.Sleep(time.Duration(attempt*2) * time.Second)
		}

		req, err := http.NewRequestWithContext(ctx, "GET", s.fetchURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "BroadSpace/1.0 (Tech Discovery Bot)")

		resp, err := s.client.Do(req)
		if err != nil {
			lastErr = fmt.Errorf("%s fetch failed: %w", s.name, err)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			lastErr = fmt.Errorf("%s returned %d", s.name, resp.StatusCode)
			continue
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
		resp.Body.Close()

		articles, err := s.parseFunc(body)
		if err != nil {
			lastErr = fmt.Errorf("%s parse failed: %w", s.name, err)
			continue
		}
		return articles, nil
	}
	return nil, lastErr
}
```

- [ ] **Step 2: Verify existing sources still compile**

```bash
cd collector && go build ./...
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add collector/internal/source/scraper.go
git commit -m "feat(collector): add retry logic to ScraperSource.Fetch (3 attempts, 2s backoff)"
```

---

### Task 2: Rewrite HackerNews source (fetch actual stories)

**Files:**
- Create: `collector/internal/source/hn.go`
- Modify: `collector/internal/source/scraper.go` — remove `NewHackerNews` function

The current `NewHackerNews()` in `scraper.go` returns empty. HN API requires two-step fetching: get top story IDs, then fetch each story's details. This needs concurrent goroutines, so it can't use `NewScraper`.

- [ ] **Step 1: Create hn.go**

Create `collector/internal/source/hn.go`:

```go
package source

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"time"
)

type HNSource struct {
	client *http.Client
}

func NewHackerNews() *HNSource {
	return &HNSource{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (h *HNSource) Name() string { return "hackernews" }

func (h *HNSource) Fetch(ctx context.Context) ([]Article, error) {
	// Step 1: Get top story IDs
	ids, err := h.fetchTopStoryIDs(ctx)
	if err != nil {
		return nil, fmt.Errorf("hn fetch top stories: %w", err)
	}

	// Limit to 50
	if len(ids) > 50 {
		ids = ids[:50]
	}

	// Step 2: Fetch each story concurrently
	articles := make([]Article, 0, len(ids))
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 10) // max 10 concurrent

	for _, id := range ids {
		wg.Add(1)
		go func(itemID int) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			article, err := h.fetchItem(ctx, itemID)
			if err != nil {
				return // skip failed items
			}
			mu.Lock()
			articles = append(articles, article)
			mu.Unlock()
		}(id)
	}

	wg.Wait()
	return articles, nil
}

func (h *HNSource) fetchTopStoryIDs(ctx context.Context) ([]int, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", "https://hacker-news.firebaseio.com/v0/topstories.json", nil)
	if err != nil {
		return nil, err
	}
	resp, err := h.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var ids []int
	if err := json.NewDecoder(resp.Body).Decode(&ids); err != nil {
		return nil, err
	}
	return ids, nil
}

func (h *HNSource) fetchItem(ctx context.Context, id int) (Article, error) {
	url := fmt.Sprintf("https://hacker-news.firebaseio.com/v0/item/%d.json", id)
	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return Article{}, err
	}
	resp, err := h.client.Do(req)
	if err != nil {
		return Article{}, err
	}
	defer resp.Body.Close()

	var item struct {
		ID    int    `json:"id"`
		Title string `json:"title"`
		URL   string `json:"url"`
		Text  string `json:"text"`
		Score int    `json:"score"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return Article{}, err
	}

	if item.URL == "" {
		item.URL = fmt.Sprintf("https://news.ycombinator.com/item?id=%d", item.ID)
	}

	return Article{
		ID:         fmt.Sprintf("hn_%d", item.ID),
		Title:      fmt.Sprintf("[HN] %s", item.Title),
		URL:        item.URL,
		SourceName: "hackernews",
		Content:    item.Text,
	}, nil
}
```

- [ ] **Step 2: Remove old NewHackerNews from scraper.go**

Remove the `NewHackerNews()` function (lines 61-71) from `collector/internal/source/scraper.go`.

- [ ] **Step 3: Verify it compiles**

```bash
cd collector && go build ./...
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add collector/internal/source/hn.go collector/internal/source/scraper.go
git commit -m "feat(collector): implement HackerNews source with concurrent story fetching"
```

---

### Task 3: Fix ArXiv dynamic date range

**Files:**
- Modify: `collector/internal/source/arxiv.go`

The date range is hardcoded to `20260524-20260525`. Make it dynamic: query yesterday to today.

- [ ] **Step 1: Convert NewArXiv to use dynamic URL**

Replace `NewArXiv` in `collector/internal/source/arxiv.go` with a custom struct that builds the URL dynamically:

```go
package source

import (
	"context"
	"encoding/xml"
	"fmt"
	"net/http"
	"strings"
	"time"
)

type ArXivSource struct {
	client *http.Client
}

func NewArXiv() *ArXivSource {
	return &ArXivSource{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (a *ArXivSource) Name() string { return "arxiv" }

func (a *ArXivSource) Fetch(ctx context.Context) ([]Article, error) {
	now := time.Now()
	yesterday := now.AddDate(0, 0, -1)
	dateRange := fmt.Sprintf("submittedDate:[%s+TO+%s]",
		yesterday.Format("20060102")+"0000",
		now.Format("20060102")+"2359")
	url := fmt.Sprintf("http://export.arxiv.org/api/query?search_query=%s&sortBy=submittedDate&sortOrder=descending&max_results=50", dateRange)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "BroadSpace/1.0 (Tech Discovery Bot)")

	resp, err := a.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("arxiv fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("arxiv returned %d", resp.StatusCode)
	}

	var feed struct {
		Entries []struct {
			ID        string `xml:"id"`
			Title     string `xml:"title"`
			Summary   string `xml:"summary"`
			Published string `xml:"published"`
			Authors   []struct {
				Name string `xml:"name"`
			} `xml:"author"`
		} `xml:"entry"`
	}
	if err := xml.NewDecoder(resp.Body).Decode(&feed); err != nil {
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
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd collector && go build ./...
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add collector/internal/source/arxiv.go
git commit -m "fix(collector): use dynamic date range for ArXiv instead of hardcoded dates"
```

---

### Task 4: Add Juejin source

**Files:**
- Create: `collector/internal/source/juejin.go`

Juejin API uses POST, so it can't use `NewScraper` (GET only). Create a custom struct.

- [ ] **Step 1: Create juejin.go**

Create `collector/internal/source/juejin.go`:

```go
package source

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type JuejinSource struct {
	client *http.Client
}

func NewJuejin() *JuejinSource {
	return &JuejinSource{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (j *JuejinSource) Name() string { return "juejin" }

func (j *JuejinSource) Fetch(ctx context.Context) ([]Article, error) {
	body := []byte(`{"id_type":2,"sort_type":200,"cate_id":"","cursor":"0","limit":50}`)
	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed",
		bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "BroadSpace/1.0 (Tech Discovery Bot)")

	resp, err := j.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("juejin fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("juejin returned %d", resp.StatusCode)
	}

	var result struct {
		Code int `json:"code"`
		Data []struct {
			ArticleInfo struct {
				ArticleID    string `json:"article_id"`
				Title        string `json:"title"`
				BriefContent string `json:"brief_content"`
			} `json:"article_info"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("juejin parse: %w", err)
	}
	if result.Code != 0 {
		return nil, fmt.Errorf("juejin API error code: %d", result.Code)
	}

	articles := make([]Article, 0, len(result.Data))
	for _, item := range result.Data {
		if item.ArticleInfo.ArticleID == "" {
			continue
		}
		articles = append(articles, Article{
			ID:         fmt.Sprintf("juejin_%s", item.ArticleInfo.ArticleID),
			Title:      fmt.Sprintf("[掘金] %s", item.ArticleInfo.Title),
			URL:        fmt.Sprintf("https://juejin.cn/post/%s", item.ArticleInfo.ArticleID),
			SourceName: "juejin",
			Content:    item.ArticleInfo.BriefContent,
		})
	}
	return articles, nil
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd collector && go build ./...
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add collector/internal/source/juejin.go
git commit -m "feat(collector): add Juejin (掘金) data source"
```

---

### Task 5: Add Lobsters source

**Files:**
- Create: `collector/internal/source/lobsters.go`

Simple GET+JSON, can use `NewScraper`.

- [ ] **Step 1: Create lobsters.go**

Create `collector/internal/source/lobsters.go`:

```go
package source

import (
	"encoding/json"
	"fmt"
)

func NewLobsters() *ScraperSource {
	return NewScraper("lobsters", "https://lobste.rs/hottest.json",
		func(body []byte) ([]Article, error) {
			var items []struct {
				Title string   `json:"title"`
				URL   string   `json:"url"`
				Tags  []string `json:"tags"`
				Score int      `json:"score"`
			}
			if err := json.Unmarshal(body, &items); err != nil {
				return nil, fmt.Errorf("lobsters parse: %w", err)
			}

			articles := make([]Article, 0, len(items))
			for _, item := range items {
				articles = append(articles, Article{
					ID:         fmt.Sprintf("lobsters_%s", item.URL),
					Title:      fmt.Sprintf("[Lobsters] %s", item.Title),
					URL:        item.URL,
					SourceName: "lobsters",
					Content:    fmt.Sprintf("Tags: %v", item.Tags),
				})
			}
			return articles, nil
		})
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd collector && go build ./...
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add collector/internal/source/lobsters.go
git commit -m "feat(collector): add Lobsters data source"
```

---

### Task 6: Add Dev.to source

**Files:**
- Create: `collector/internal/source/devto.go`

Simple GET+JSON, can use `NewScraper`.

- [ ] **Step 1: Create devto.go**

Create `collector/internal/source/devto.go`:

```go
package source

import (
	"encoding/json"
	"fmt"
)

func NewDevTo() *ScraperSource {
	return NewScraper("devto", "https://dev.to/api/articles?top=1&per_page=50",
		func(body []byte) ([]Article, error) {
			var items []struct {
				Title       string   `json:"title"`
				URL         string   `json:"url"`
				Description string   `json:"description"`
				Tags        []string `json:"tag_list"`
			}
			if err := json.Unmarshal(body, &items); err != nil {
				return nil, fmt.Errorf("devto parse: %w", err)
			}

			articles := make([]Article, 0, len(items))
			for _, item := range items {
				articles = append(articles, Article{
					ID:         fmt.Sprintf("devto_%s", item.URL),
					Title:      fmt.Sprintf("[Dev.to] %s", item.Title),
					URL:        item.URL,
					SourceName: "devto",
					Content:    item.Description,
				})
			}
			return articles, nil
		})
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd collector && go build ./...
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add collector/internal/source/devto.go
git commit -m "feat(collector): add Dev.to data source"
```

---

### Task 7: Add 36Kr source (RSS XML)

**Files:**
- Create: `collector/internal/source/kr36.go`

RSS XML, same parsing pattern as ArXiv.

- [ ] **Step 1: Create kr36.go**

Create `collector/internal/source/kr36.go`:

```go
package source

import (
	"encoding/xml"
	"fmt"
	"strings"
)

func NewKr36() *ScraperSource {
	return NewScraper("kr36", "https://36kr.com/feed",
		func(body []byte) ([]Article, error) {
			var feed struct {
				Channel struct {
					Items []struct {
						Title       string `xml:"title"`
						Link        string `xml:"link"`
						Description string `xml:"description"`
						PubDate     string `xml:"pubDate"`
					} `xml:"item"`
				} `xml:"channel"`
			}
			if err := xml.Unmarshal(body, &feed); err != nil {
				return nil, fmt.Errorf("kr36 parse: %w", err)
			}

			articles := make([]Article, 0, len(feed.Channel.Items))
			for _, item := range feed.Channel.Items {
				title := strings.TrimSpace(item.Title)
				articles = append(articles, Article{
					ID:          fmt.Sprintf("kr36_%s", item.Link),
					Title:       fmt.Sprintf("[36氪] %s", title),
					URL:         item.Link,
					SourceName:  "kr36",
					PublishedAt: item.PubDate,
					Content:     strings.TrimSpace(item.Description),
				})
			}
			return articles, nil
		})
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd collector && go build ./...
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add collector/internal/source/kr36.go
git commit -m "feat(collector): add 36Kr (36氪) RSS data source"
```

---

### Task 8: Register all new sources in main.go

**Files:**
- Modify: `collector/cmd/collector/main.go:29-36`

- [ ] **Step 1: Add new sources to main.go**

In `collector/cmd/collector/main.go`, update the sources slice:

```go
sources := []source.Source{
    source.NewMiniflux(cfg.MinifluxURL, cfg.MinifluxUser, cfg.MinifluxPass),
    source.NewHackerNews(),
    source.NewGitHubTrending(),
    source.NewArXiv(),
    source.NewV2EX(),
    source.NewJuejin(),
    source.NewLobsters(),
    source.NewDevTo(),
    source.NewKr36(),
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd collector && go build -o bin/collector ./cmd/collector
```

Expected: no errors, binary created at `collector/bin/collector`

- [ ] **Step 3: Commit**

```bash
git add collector/cmd/collector/main.go
git commit -m "feat(collector): register all 9 data sources in main"
```

---

### Task 9: Add Miniflux RSS subscriptions

**Files:**
- None (API call via curl)

- [ ] **Step 1: Add RSS feeds to Miniflux**

```bash
curl -s -u admin:admin123 -X POST http://localhost:8080/v1/feeds \
  -H "Content-Type: application/json" \
  -d '{"feed_url":"https://hnrss.org/best","category_id":1}' | python3 -m json.tool

curl -s -u admin:admin123 -X POST http://localhost:8080/v1/feeds \
  -H "Content-Type: application/json" \
  -d '{"feed_url":"https://techcrunch.com/feed/","category_id":1}' | python3 -m json.tool

curl -s -u admin:admin123 -X POST http://localhost:8080/v1/feeds \
  -H "Content-Type: application/json" \
  -d '{"feed_url":"https://www.theverge.com/rss/index.xml","category_id":1}' | python3 -m json.tool

curl -s -u admin:admin123 -X POST http://localhost:8080/v1/feeds \
  -H "Content-Type: application/json" \
  -d '{"feed_url":"https://sspai.com/feed","category_id":1}' | python3 -m json.tool
```

Expected: each returns JSON with `"id"` field (success)

- [ ] **Step 2: Verify feeds are subscribed**

```bash
curl -s -u admin:admin123 http://localhost:8080/v1/feeds | python3 -m json.tool | head -30
```

Expected: feeds list contains the newly added RSS sources

---

### Task 10: End-to-end verification

- [ ] **Step 1: Run collector once and check logs**

```bash
# Kill existing collector if running
pkill -f "bin/collector" 2>/dev/null
sleep 1

# Run collector with timeout (it runs in a loop, so kill after 60s)
timeout 90 ./collector/bin/collector 2>&1 | grep -E "source .*: fetched|failed|skipped" | head -30
```

Expected output should include lines like:
```
source hackernews: fetched 50 articles
source arxiv: fetched N articles
source github_trending: fetched 50 articles
source juejin: fetched 50 articles
source lobsters: fetched 25 articles
source devto: fetched 50 articles
source kr36: fetched N articles
```

- [ ] **Step 2: Check processor is consuming the new articles**

```bash
tail -20 /home/jinru/workon/broad_space/logs/processor.log | grep -E "Classified|Summarized|Triples"
```

Expected: new articles being classified with real categories (not "Other")

- [ ] **Step 3: Verify analytics API shows diverse sources**

```bash
curl -s http://localhost:8000/analytics | python3 -m json.tool | grep -A 2 '"source"'
```

Expected: source_counts shows multiple sources (not just github_trending and arxiv)
