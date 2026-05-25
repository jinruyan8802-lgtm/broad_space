package source

// NewZhihu returns a stub scraper for Zhihu.
// Phase 2: Full implementation requires auth/session handling due to Zhihu's login wall.
// This stub allows the collector to compile and wire up the source without errors.
func NewZhihu() *ScraperSource {
	return NewScraper("zhihu", "https://www.zhihu.com/api/v3/feed/topstory",
		func(body []byte) ([]Article, error) {
			// Stub: Zhihu API requires authentication cookies/session.
			// Return empty list until auth is implemented.
			return []Article{}, nil
		})
}