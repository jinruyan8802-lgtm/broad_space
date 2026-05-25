package source

import (
	"encoding/json"
	"fmt"
)

type V2EXTopic struct {
	ID      int    `json:"id"`
	Title   string `json:"title"`
	URL     string `json:"url"`
	Content string `json:"content"`
	Created int64  `json:"created"`
}

type V2EXResponse []V2EXTopic

func NewV2EX() *ScraperSource {
	return NewScraper("v2ex", "https://www.v2ex.com/api/topics/hot.json",
		func(body []byte) ([]Article, error) {
			var topics V2EXResponse
			if err := json.Unmarshal(body, &topics); err != nil {
				return nil, fmt.Errorf("v2ex parse: %w", err)
			}
			articles := make([]Article, 0, len(topics))
			for _, t := range topics {
				articles = append(articles, Article{
					ID:          fmt.Sprintf("v2ex_%d", t.ID),
					Title:       fmt.Sprintf("[V2EX] %s", t.Title),
					URL:         t.URL,
					SourceName:  "v2ex",
					PublishedAt: fmt.Sprintf("%d", t.Created),
					Content:     t.Content,
				})
			}
			return articles, nil
		})
}