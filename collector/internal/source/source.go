package source

import "context"

type Article struct {
	ID          string
	Title       string
	URL         string
	SourceName  string
	PublishedAt string
	Content     string
	Summary     string
}

type Source interface {
	Name() string
	Fetch(ctx context.Context) ([]Article, error)
}