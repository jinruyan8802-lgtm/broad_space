package source

import (
	"encoding/xml"
	"fmt"
	"strings"
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