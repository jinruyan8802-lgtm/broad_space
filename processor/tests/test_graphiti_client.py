import os
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from processor.knowledge.graphiti_client import GraphitiClient


def test_add_triples_no_client():
    """When Neo4j is not available, returns False gracefully."""
    with patch("processor.knowledge.graphiti_client.NEO4J_AVAILABLE", False):
        client = GraphitiClient(uri="bolt://localhost:7687", user="neo4j", password="broad")
        result = client.add_triples("evt_001", [{"subject": "Python", "predicate": "drives", "object": "AI"}])
        assert result is False


def test_search_no_client():
    """When Neo4j is not available, returns empty list gracefully."""
    with patch("processor.knowledge.graphiti_client.NEO4J_AVAILABLE", False):
        client = GraphitiClient(uri="bolt://localhost:7687", user="neo4j", password="broad")
        result = client.search("Python AI")
        assert result == []


def test_init_defaults():
    """Test that GraphitiClient reads from environment variables."""
    with patch.dict(os.environ, {"NEO4J_URI": "bolt://custom:7687", "NEO4J_USER": "user", "NEO4J_PASSWORD": "pass"}):
        client = GraphitiClient()
        assert client.uri == "bolt://custom:7687"
        assert client.user == "user"
        assert client.password == "pass"