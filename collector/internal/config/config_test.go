package config

import (
	"os"
	"testing"
)

func TestLoad_Defaults(t *testing.T) {
	os.Unsetenv("REDIS_URL")
	os.Unsetenv("MINIFLUX_URL")

	cfg := Load()

	if cfg.RedisURL != "redis://localhost:6379/0" {
		t.Errorf("expected default RedisURL, got %s", cfg.RedisURL)
	}
	if cfg.MaxConcurrency != 50 {
		t.Errorf("expected concurrency 50, got %d", cfg.MaxConcurrency)
	}
}

func TestLoad_FromEnv(t *testing.T) {
	os.Setenv("REDIS_URL", "redis://custom:6379/1")
	defer os.Unsetenv("REDIS_URL")

	cfg := Load()

	if cfg.RedisURL != "redis://custom:6379/1" {
		t.Errorf("expected custom RedisURL, got %s", cfg.RedisURL)
	}
}
