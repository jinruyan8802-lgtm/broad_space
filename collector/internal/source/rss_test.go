package source

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMinifluxSource_Fetch(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/entries" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		user, pass, ok := r.BasicAuth()
		if !ok || user != "admin" || pass != "secret" {
			t.Errorf("bad auth: %s/%s", user, pass)
		}

		resp := map[string]interface{}{
			"total": 1,
			"entries": []map[string]interface{}{
				{
					"id":           42,
					"title":        "Test Article",
					"url":          "https://example.com/test",
					"feed":         map[string]string{"title": "Test Feed"},
					"published_at": "2026-05-25T08:00:00Z",
					"content":      "<p>Test content</p>",
				},
			},
		}
		json.NewEncoder(w).Encode(resp)
	}))
	defer ts.Close()

	src := NewMiniflux(ts.URL, "admin", "secret")
	articles, err := src.Fetch(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(articles) != 1 {
		t.Fatalf("expected 1 article, got %d", len(articles))
	}
	if articles[0].Title != "Test Article" {
		t.Errorf("unexpected title: %s", articles[0].Title)
	}
	if articles[0].SourceName != "Test Feed" {
		t.Errorf("unexpected source name: %s", articles[0].SourceName)
	}
}