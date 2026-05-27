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
