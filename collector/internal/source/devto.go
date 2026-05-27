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
