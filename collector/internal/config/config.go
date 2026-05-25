package config

import (
	"os"
)

type Config struct {
	RedisURL      string
	MinifluxURL   string
	MinifluxUser  string
	MinifluxPass  string
	MaxConcurrency int
	FetchInterval  string
}

func Load() *Config {
	return &Config{
		RedisURL:       getEnv("REDIS_URL", "redis://localhost:6379/0"),
		MinifluxURL:    getEnv("MINIFLUX_URL", "http://localhost:8080"),
		MinifluxUser:   getEnv("MINIFLUX_ADMIN", "admin"),
		MinifluxPass:   getEnv("MINIFLUX_PASSWORD", "admin123"),
		MaxConcurrency: 50,
		FetchInterval:  getEnv("FETCH_INTERVAL", "30m"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
