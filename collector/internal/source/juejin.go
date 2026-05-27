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
		ErrNo int `json:"err_no"`
		Data  []struct {
			ItemInfo struct {
				ArticleInfo struct {
					ArticleID    string `json:"article_id"`
					Title        string `json:"title"`
					BriefContent string `json:"brief_content"`
				} `json:"article_info"`
			} `json:"item_info"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("juejin parse: %w", err)
	}
	if result.ErrNo != 0 {
		return nil, fmt.Errorf("juejin API error code: %d", result.ErrNo)
	}

	articles := make([]Article, 0, len(result.Data))
	for _, item := range result.Data {
		info := item.ItemInfo.ArticleInfo
		if info.ArticleID == "" {
			continue
		}
		articles = append(articles, Article{
			ID:         fmt.Sprintf("juejin_%s", info.ArticleID),
			Title:      fmt.Sprintf("[掘金] %s", info.Title),
			URL:        fmt.Sprintf("https://juejin.cn/post/%s", info.ArticleID),
			SourceName: "juejin",
			Content:    info.BriefContent,
		})
	}
	return articles, nil
}
