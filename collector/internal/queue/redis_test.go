package queue

import (
	"context"
	"testing"

	"github.com/alicebob/miniredis/v2"
)

func TestPublisher_Publish(t *testing.T) {
	m, err := miniredis.Run()
	if err != nil {
		t.Fatalf("miniredis.Run: %v", err)
	}
	defer m.Close()

	pub, err := NewPublisher("redis://"+m.Addr(), "broadspace:articles")
	if err != nil {
		t.Fatalf("new publisher: %v", err)
	}
	defer pub.Close()

	ctx := context.Background()
	err = pub.Publish(ctx, "article", []byte(`{"title":"test"}`))
	if err != nil {
		t.Fatalf("publish failed: %v", err)
	}

	// Verify stream exists and has entry
	entries, err := m.Stream("broadspace:articles")
	if err != nil {
		t.Fatalf("stream check failed: %v", err)
	}
	if len(entries) != 1 {
		t.Errorf("expected stream length 1, got %d", len(entries))
	}
}