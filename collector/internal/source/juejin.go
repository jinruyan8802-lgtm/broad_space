package source

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

type JuejinSource struct {
	client *http.Client
}

func NewJuejin() *JuejinSource {
	return &JuejinSource{
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

func (j *JuejinSource) Name() string { return "juejin" }

func (j *JuejinSource) Fetch(ctx context.Context) ([]Article, error) {
	body := []byte(`{"id_type":2,"sort_type":200,"cate_id":"","cursor":"0","limit":50}`)
	req, err := http.NewRequestWithContext(ctx, "POST",
		"https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed",
		bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "BroadSpace/1.0 (Tech Discovery Bot)")

	resp, err := j.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("juejin fetch failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("juejin returned %d", resp.StatusCode)
	}

	var result struct {
		Code int `json:"code"`
		Data []struct {
			ArticleInfo struct {
				ArticleID    string `json:"article_id"`
				Title        string `json:"title"`
				BriefContent string `json:"brief_content"`
			} `json:"article_info"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("juejin parse: %w", err)
	}
	if result.Code != 0 {
		return nil, fmt.Errorf("juejin API error code: %d", result.Code)
	}

	articles := make([]Article, 0, len(result.Data))
	for _, item := range result.Data {
		if item.ArticleInfo.ArticleID == "" {
			continue
		}
		articles = append(articles, Article{
			ID:         fmt.Sprintf("juejin_%s", item.ArticleInfo.ArticleID),
			Title:      fmt.Sprintf("[掘金] %s", item.ArticleInfo.Title),
			URL:        fmt.Sprintf("https://juejin.cn/post/%s", item.ArticleInfo.ArticleID),
			SourceName: "juejin",
			Content:    item.ArticleInfo.BriefContent,
		})
	}
	return articles, nil
}
