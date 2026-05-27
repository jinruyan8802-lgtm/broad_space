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
