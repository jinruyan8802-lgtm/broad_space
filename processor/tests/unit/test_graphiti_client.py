import pytest
from unittest.mock import AsyncMock, MagicMock, patch

def test_search_sync_returns_list():
    with patch("processor.knowledge.graphiti_client.GRAPHTI_AVAILABLE", True):
        from processor.knowledge.graphiti_client import GraphitiClient
        client = GraphitiClient(uri="bolt://localhost:7687", user="neo4j", password="broad")
        # Set up mock client so self.client check passes
        client._client = MagicMock()
        # Mock search returns a coroutine that yields real dicts (like the real method)
        async def mock_search(query, limit=10):
            return [{"text": "PyTorch drives AI", "score": 0.95}]
        client.search = mock_search
        result = client.search_sync("AI")
        assert isinstance(result, list)
        assert len(result) == 1
        assert result[0]["text"] == "PyTorch drives AI"
        assert result[0]["score"] == 0.95

def test_add_triples_batch_returns_bool():
    with patch("processor.knowledge.graphiti_client.GRAPHTI_AVAILABLE", True):
        from processor.knowledge.graphiti_client import GraphitiClient
        client = GraphitiClient(uri="bolt://localhost:7687", user="neo4j", password="broad")
        client._client = MagicMock()
        client.add_triples = AsyncMock(return_value=True)
        triples = [
            {"subject": "PyTorch", "predicate": "drives", "object": "AI"}
        ]
        result = client.add_triples_batch("test-id", triples)
        assert result is True