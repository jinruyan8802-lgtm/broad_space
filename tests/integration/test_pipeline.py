import json
import os
import signal
import subprocess
import sys
import time

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


def _get_env():
    """Build environment dict for API server."""
    env = os.environ.copy()
    env["PYTHONPATH"] = os.path.abspath("processor/src")
    env.setdefault("DB_USER", "broadspace")
    env.setdefault("DB_PASSWORD", "change_me_in_production")
    env.setdefault("DB_NAME", "broadspace")
    env.setdefault("DB_HOST", "localhost")
    return env


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


@pytest.fixture(scope="module")
def api_server(services):
    """Start the FastAPI server for integration testing."""
    env = _get_env()
    uvicorn_paths = [
        os.path.abspath("processor/.venv/bin/uvicorn"),
        os.path.abspath("api/.venv/bin/uvicorn"),
        "uvicorn",
    ]
    uvicorn = None
    for p in uvicorn_paths:
        if os.path.exists(p) or subprocess.run(["which", p], capture_output=True).returncode == 0:
            uvicorn = p
            break
    if uvicorn is None:
        pytest.skip("uvicorn not found")

    proc = subprocess.Popen(
        [uvicorn, "main:app", "--host", "127.0.0.1", "--port", "8001"],
        cwd="api",
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    base_url = "http://127.0.0.1:8001"
    for _ in range(30):
        try:
            resp = requests.get(f"{base_url}/health", timeout=1)
            if resp.status_code == 200:
                break
        except requests.ConnectionError:
            time.sleep(0.5)
    else:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
        pytest.skip("API server failed to start")

    yield base_url

    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()


def test_end_to_end_pipeline(services, api_server):
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
        "summary": "A test article about AI.",
        "key_points": ["AI is important", "Machine learning is cool"],
        "signal_strength": 0.85,
        "sentiment": "positive",
        "consensus": "All sources agree it's about AI.",
        "divergence": "No divergence.",
        "related_trends": ["AI trend"],
        "paradigm_signal": False,
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

    # --- API Endpoints ---

    # 1. Health check
    resp = requests.get(f"{api_server}/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}

    # 2. List content (no category filter — the previously failing case!)
    resp = requests.get(f"{api_server}/content")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["title"] == "Test Article for Integration"
    assert data[0]["id"] == "testhash001"

    # 3. List content with category filter
    resp = requests.get(f"{api_server}/content", params={"category": "AI/ML"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) >= 1
    assert data[0]["id"] == "testhash001"

    # 4. List content with non-matching category filter
    resp = requests.get(f"{api_server}/content", params={"category": "Security"})
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 0

    # 5. Get single content
    resp = requests.get(f"{api_server}/content/testhash001")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == "testhash001"
    assert data["title"] == "Test Article for Integration"

    # 6. Get non-existent content
    resp = requests.get(f"{api_server}/content/nonexistent")
    assert resp.status_code == 404