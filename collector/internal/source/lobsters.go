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
