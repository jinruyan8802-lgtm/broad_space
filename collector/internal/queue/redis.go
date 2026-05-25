package queue

import (
	"context"
	"fmt"

	"github.com/redis/go-redis/v9"
)

type Publisher struct {
	client redis.UniversalClient
	stream string
}

func NewPublisher(redisURL, stream string) (*Publisher, error) {
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(opts)
	if client == nil {
		return nil, fmt.Errorf("failed to create redis client")
	}
	return &Publisher{client: client, stream: stream}, nil
}

func (p *Publisher) Publish(ctx context.Context, key string, data []byte) error {
	return p.client.XAdd(ctx, &redis.XAddArgs{
		Stream: p.stream,
		Values: map[string]interface{}{
			key: string(data),
		},
	}).Err()
}

func (p *Publisher) Close() error {
	return p.client.Close()
}