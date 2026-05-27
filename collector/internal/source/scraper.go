package source

import (
	"context"
	"fmt"
	"net/http"
	"time"
)

type ScraperSource struct {
	name      string
	fetchURL  string
	parseFunc func([]byte) ([]Article, error)
	client    *http.Client
}

func NewScraper(name, fetchURL string, parseFunc func([]byte) ([]Article, error)) *ScraperSource {
	return &ScraperSource{
		name:      name,
		fetchURL:  fetchURL,
		parseFunc: parseFunc,
		client:    &http.Client{Timeout: 30 * time.Second},
	}
}

func (s *ScraperSource) Name() string { return s.name }

func (s *ScraperSource) Fetch(ctx context.Context) ([]Article, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-time.After(time.Duration(attempt*2) * time.Second):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}

		req, err := http.NewRequestWithContext(ctx, "GET", s.fetchURL, nil)
		if err != nil {
			return nil, err
		}
		req.Header.Set("User-Agent", "BroadSpace/1.0 (Tech Discovery Bot)")

		resp, err := s.client.Do(req)
		if err != nil {
			if resp != nil {
				resp.Body.Close()
			}
			lastErr = fmt.Errorf("%s fetch failed: %w", s.name, err)
			continue
		}

		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			lastErr = fmt.Errorf("%s returned %d", s.name, resp.StatusCode)
			continue
		}

		body := make([]byte, 0, 1024*1024)
		buf := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(buf)
			if n > 0 {
				body = append(body, buf[:n]...)
			}
			if err != nil {
				break
			}
		}
		resp.Body.Close()

		articles, err := s.parseFunc(body)
		if err != nil {
			lastErr = fmt.Errorf("%s parse failed: %w", s.name, err)
			continue
		}
		return articles, nil
	}
	return nil, lastErr
}

