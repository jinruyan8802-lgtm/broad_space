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
