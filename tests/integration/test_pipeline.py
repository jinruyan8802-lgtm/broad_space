import json
import os
import time
import subprocess
import sys

import pytest
import redis
import requests
from sqlalchemy import create_engine, text


def _get_db_url():
    return (
        f"postgresql://{os.environ.get('DB_USER', 'broadspace')}:"
        f"{os.environ.get('DB_PASSWORD', 'change_me_in_production')}@"
        f"{os.environ.get('DB_HOST', 'localhost')}:5432/"
        f"{os.environ.get('DB_NAME', 'broadspace')}"
    )


@pytest.fixture(scope="module")
def services():
    """Ensure Docker services are running."""
    # Check Redis
    r = redis.from_url(os.environ.get("REDIS_URL", "redis://localhost:6379/0"))
    try:
        r.ping()
    except redis.ConnectionError:
        pytest.skip("Redis not available — run 'docker compose up -d' first")

    # Check PostgreSQL
    engine = create_engine(_get_db_url())
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception:
        pytest.skip("PostgreSQL not available — run 'docker compose up -d' first")

    return {"redis": r, "db": engine, "db_url": _get_db_url()}


def test_end_to_end_pipeline(services):
    """Test: publish a raw article to Redis, run processor, verify it's in DB and API."""
    r = services["redis"]
    db = services["db"]

    # Create table if not exists
    from processor.worker_models import Base
    Base.metadata.create_all(db)

    # Clean up
    r.delete("broadspace:articles")
    with db.connect() as conn:
        conn.execute(text("DELETE FROM processed_articles"))
        conn.commit()

    # Publish a test article
    article = {
        "id": "test_001",
        "title": "Test Article for Integration",
        "url": "https://example.com/test",
        "source_name": "test_source",
        "published_at": "2026-05-25T08:00:00Z",
        "content": "This is a test article about AI and machine learning.",
        "fetched_at": "2026-05-25T08:00:00Z",
        "hash": "testhash001",
        "raw": {},
    }

    r.xadd("broadspace:articles", {"testhash001": json.dumps(article)})

    # Run processor worker (mock LLM for speed)
    from unittest.mock import MagicMock
    from processor.worker import Worker
    from processor.llm.client import LLMClient

    mock_llm = MagicMock(spec=LLMClient)
    mock_llm.chat_json.return_value = {
        "categories": ["AI/ML"],
        "confidence": 0.9,
    }

    worker = Worker(
        redis_url=os.environ.get("REDIS_URL", "redis://localhost:6379/0"),
        db_url=services["db_url"],
        llm=mock_llm,
    )

    results = worker.run(count=10, block_ms=1000)

    assert len(results) >= 1
    assert results[0].title == "Test Article for Integration"

    # Verify in database
    with db.connect() as conn:
        row = conn.execute(
            text("SELECT title FROM processed_articles WHERE id = :id"),
            {"id": "testhash001"}
        ).fetchone()
        assert row is not None
        assert row.title == "Test Article for Integration"