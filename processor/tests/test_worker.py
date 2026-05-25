from unittest.mock import MagicMock, patch

import pytest
import redis

from processor.models import RawArticle
from processor.worker import Worker


@pytest.fixture
def mock_worker():
    with patch("processor.worker.redis") as mock_redis, \
         patch("processor.worker.create_engine") as mock_engine:

        mock_client = MagicMock()
        mock_client.xgroup_create.return_value = None
        mock_client.xreadgroup.return_value = []
        mock_redis.from_url.return_value = mock_client

        mock_llm = MagicMock()
        mock_llm.chat_json.return_value = {}

        worker = Worker(
            redis_url="redis://localhost:6379/0",
            db_url="postgresql://user:pass@localhost/db",
            llm=mock_llm,
        )
        return worker


def test_worker_processes_messages(mock_worker):
    article = RawArticle(
        id="a1", title="Test", url="https://test.com",
        source_name="HN", hash="h1", fetched_at="2026-05-25T08:00:00Z"
    )

    mock_worker.redis.xreadgroup.return_value = [
        (b"broadspace:articles", [
            (b"msg1", {b"h1": article.model_dump_json().encode()})
        ])
    ]

    results = mock_worker.run()

    assert len(results) == 1
    assert results[0].title == "Test"
    mock_worker.redis.xack.assert_called_once()