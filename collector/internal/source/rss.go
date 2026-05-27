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
			Title:       fmt.Sprintf("[Miniflux] %s", e.Title),
			URL:         e.URL,
			SourceName:  "miniflux",
			PublishedAt: e.PublishedAt,
			Content:     e.Content,
		})
	}
	return articles, nil
}