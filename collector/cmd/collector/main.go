package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/broadspace/collector/internal/config"
	"github.com/broadspace/collector/internal/normalizer"
	"github.com/broadspace/collector/internal/queue"
	"github.com/broadspace/collector/internal/source"
)

func main() {
	cfg := config.Load()
	log.Printf("BroadSpace collector starting (concurrency=%d interval=%s)", cfg.MaxConcurrency, cfg.FetchInterval)

	publisher, err := queue.NewPublisher(cfg.RedisURL, "broadspace:articles")
	if err != nil {
		log.Fatalf("redis publisher: %v", err)
	}
	defer publisher.Close()
	log.Printf("Connected to Redis: %s", cfg.RedisURL)

	sources := []source.Source{
		source.NewMiniflux(cfg.MinifluxURL, cfg.MinifluxUser, cfg.MinifluxPass),
		source.NewHackerNews(),
		source.NewGitHubTrending(),
		source.NewArXiv(),
		source.NewV2EX(),
		source.NewJuejin(),
		source.NewLobsters(),
		source.NewDevTo(),
		source.NewKr36(),
	}
	log.Printf("Configured %d sources: %v", len(sources), sourceNames(sources))

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Println("shutting down...")
		cancel()
	}()

	ticker := time.NewTicker(30 * time.Minute)
	defer ticker.Stop()

	// Run immediately on start
	runCollection(ctx, sources, publisher, cfg.MaxConcurrency)

	for {
		select {
		case <-ticker.C:
			runCollection(ctx, sources, publisher, cfg.MaxConcurrency)
		case <-ctx.Done():
			log.Println("collector stopped")
			return
		}
	}
}

func runCollection(ctx context.Context, sources []source.Source, pub *queue.Publisher, maxConcurrency int) {
	start := time.Now()
	log.Println("starting collection cycle...")

	semaphore := make(chan struct{}, maxConcurrency)
	var wg sync.WaitGroup

	for _, src := range sources {
		wg.Add(1)
		go func(s source.Source) {
			defer wg.Done()

			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			articles, err := s.Fetch(ctx)
			if err != nil {
				log.Printf("source %s failed: %v", s.Name(), err)
				return
			}

			if len(articles) == 0 {
				log.Printf("source %s: no articles fetched", s.Name())
				return
			}
			log.Printf("source %s: fetched %d articles", s.Name(), len(articles))

			published := 0
			for _, article := range articles {
				norm := normalizer.Normalize(article)
				data, err := norm.ToJSON()
				if err != nil {
					log.Printf("normalize failed for article %s: %v", article.ID, err)
					continue
				}

				if err := pub.Publish(ctx, norm.Hash, data); err != nil {
					log.Printf("publish failed for article %s: %v", norm.Hash, err)
					continue
				}
				published++
			}
			log.Printf("source %s: published %d/%d articles", s.Name(), published, len(articles))
		}(src)
	}

	wg.Wait()
	log.Printf("collection cycle complete in %v", time.Since(start))
}

func sourceNames(sources []source.Source) []string {
	names := make([]string, len(sources))
	for i, s := range sources {
		names[i] = s.Name()
	}
	return names
}
