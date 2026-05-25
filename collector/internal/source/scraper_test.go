package source

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestScraperSource_Fetch(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("User-Agent") == "" {
			t.Error("missing User-Agent header")
		}
		w.Write([]byte(`{"items": [{"title": "Scraped", "url": "https://example.com"}]}`))
	}))
	defer ts.Close()

	src := NewScraper("test_scraper", ts.URL, func(body []byte) ([]Article, error) {
		return []Article{{
			ID:         "test_1",
			Title:      "Scraped",
			URL:        "https://example.com",
			SourceName: "test_scraper",
		}}, nil
	})

	articles, err := src.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(articles) != 1 {
		t.Fatalf("expected 1 article, got %d", len(articles))
	}
	if articles[0].Title != "Scraped" {
		t.Errorf("unexpected title: %s", articles[0].Title)
	}
}