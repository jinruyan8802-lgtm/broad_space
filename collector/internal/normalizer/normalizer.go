package normalizer

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"github.com/broadspace/collector/internal/source"
)

type NormalizedArticle struct {
	ID          string         `json:"id"`
	Title       string         `json:"title"`
	URL         string         `json:"url"`
	SourceName  string         `json:"source_name"`
	PublishedAt string         `json:"published_at"`
	Content     string         `json:"content"`
	FetchedAt   string         `json:"fetched_at"`
	Hash        string         `json:"hash"`
	Raw         source.Article `json:"raw"`
}

func Normalize(article source.Article) NormalizedArticle {
	hash := sha256.Sum256([]byte(article.URL + "|" + article.Title))
	return NormalizedArticle{
		ID:          fmt.Sprintf("%s_%s", article.SourceName, article.ID),
		Title:       article.Title,
		URL:         article.URL,
		SourceName:  article.SourceName,
		PublishedAt: article.PublishedAt,
		Content:     article.Content,
		FetchedAt:   time.Now().UTC().Format(time.RFC3339),
		Hash:        hex.EncodeToString(hash[:]),
		Raw:         article,
	}
}

func (n NormalizedArticle) ToJSON() ([]byte, error) {
	return json.Marshal(n)
}