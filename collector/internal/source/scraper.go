package source

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type ScraperSource struct {
	name      string
	fetchURL  string
	parseFunc func([]byte) ([]Article, error)
	client    *http.Client
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