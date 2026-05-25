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