import pytest
from unittest.mock import patch, MagicMock
from processor.pipeline.ranker import Ranker
from processor.models import ProcessedContent

def test_score_expand_uses_graph_proximity():
    with patch("processor.knowledge.graphiti_client.GRAPHTI_AVAILABLE", True):
        from processor.knowledge.graphiti_client import GraphitiClient

        mock_client = MagicMock(spec=GraphitiClient)
        mock_client.search_sync.return_value = [
            {"text": "PyTorch drives AI", "score": 0.9},
            {"text": "PyTorch competes with JAX", "score": 0.85},
        ]

        ranker = Ranker(user_categories=["AI/ML"], graphiti_client=mock_client)
        content = ProcessedContent(
            id="test1",
            title="PyTorch 2.0 released",
            summary="PyTorch drives AI research",
            key_points=["PyTorch"],
            categories=["AI/ML"],
            signal_strength=0.8,
        )
        scores = ranker.score(content)
        assert scores["expand"] > 0.3, f"Expected expand > 0.3, got {scores['expand']}"
        assert mock_client.search_sync.called

def test_score_expand_fallback_when_no_graphiti():
    ranker = Ranker(user_categories=["AI/ML"], graphiti_client=None)
    content = ProcessedContent(
        id="test1",
        title="PyTorch 2.0 released",
        summary="PyTorch drives AI research",
        key_points=["PyTorch"],
        categories=["AI/ML"],
        signal_strength=0.8,
    )
    scores = ranker.score(content)
    assert scores["expand"] == 0.3