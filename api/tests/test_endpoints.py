"""Basic endpoint tests for BroadSpace API."""
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import datetime

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def mock_session():
    """Mock SQLAlchemy session."""
    session = MagicMock()
    return session


@pytest.fixture
def client(mock_session):
    """Create TestClient with mocked DB session."""
    with patch("main.Session", return_value=mock_session):
        from main import app
        with TestClient(app) as c:
            yield c


class TestHealthEndpoint:
    def test_health_returns_ok(self, client):
        resp = client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestMetricsEndpoint:
    def test_metrics_returns_text(self, client):
        resp = client.get("/metrics")
        assert resp.status_code == 200
        assert "api_requests_total" in resp.text


class TestContentEndpoint:
    def test_content_returns_list(self, client, mock_session):
        mock_session.execute.return_value = []
        resp = client.get("/content")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_content_with_category_filter(self, client, mock_session):
        mock_session.execute.return_value = []
        resp = client.get("/content?category=AI/ML")
        assert resp.status_code == 200

    def test_content_with_signal_filter(self, client, mock_session):
        mock_session.execute.return_value = []
        resp = client.get("/content?min_signal=0.5&limit=10")
        assert resp.status_code == 200

    def test_content_sort_by_time(self, client, mock_session):
        mock_session.execute.return_value = []
        resp = client.get("/content?sort_by=time&sort_order=desc")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_content_sort_by_signal_asc(self, client, mock_session):
        mock_session.execute.return_value = []
        resp = client.get("/content?sort_by=signal&sort_order=asc")
        assert resp.status_code == 200

    def test_content_pagination_mode(self, client, mock_session):
        # Mock count query result
        count_row = MagicMock()
        count_row.total = 0
        mock_count_result = MagicMock()
        mock_count_result.fetchone.return_value = count_row

        # Mock data query result (empty list, iterable)
        mock_data_result = []

        # First execute() call = count, second = data
        mock_session.execute.side_effect = [mock_count_result, mock_data_result]

        resp = client.get("/content?page=1&page_size=10")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 10
        assert data["total_pages"] == 1

    def test_content_backward_compat_no_page(self, client, mock_session):
        """Without page param, returns array format (backward compatible)."""
        mock_session.execute.return_value = []
        resp = client.get("/content")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


class TestAnalyticsEndpoint:
    def _mock_analytics(self, mock_session):
        """Set up mock returns for all analytics queries."""
        # Signal distribution
        signal_row = MagicMock()
        signal_row.high = 5
        signal_row.mid = 10
        signal_row.low = 3

        # Category counts
        cat_row = MagicMock()
        cat_row.category = "AI/ML"
        cat_row.count = 8

        # Sentiment
        sent_row = MagicMock()
        sent_row.positive = 4
        sent_row.neutral = 10
        sent_row.negative = 2

        # Volume timeline
        vol_row = MagicMock()
        vol_row.date = "2026-05-27"
        vol_row.count = 15

        # Source counts
        src_row = MagicMock()
        src_row.source = "github_trending"
        src_row.count = 10

        # Trending
        trend_row = MagicMock()
        trend_row.category = "AI/ML"
        trend_row.count = 8

        # Score distribution
        score_row = MagicMock()
        score_row.avg_exploit = 0.25
        score_row.avg_expand = 0.15
        score_row.avg_explore = 0.10
        score_row.avg_final = 0.50

        # Source diversity
        div_row = MagicMock()
        div_row.category = "AI/ML"
        div_row.sources = ["github_trending"]

        # Return different results for each query call
        mock_session.execute.return_value.fetchone.side_effect = [
            signal_row, sent_row, score_row,
        ]
        mock_session.execute.return_value.fetchall.side_effect = [
            [cat_row],  # category_counts
            [vol_row],  # volume_timeline
            [src_row],  # source_counts
            [trend_row],  # trending current
            [],  # trending previous
            [div_row],  # source_diversity
        ]

    def test_analytics_returns_response(self, client, mock_session):
        self._mock_analytics(mock_session)
        resp = client.get("/analytics?days=7")
        assert resp.status_code == 200
        data = resp.json()
        assert "signal_distribution" in data
        assert "category_counts" in data
        assert "sentiment_counts" in data
        assert "volume_timeline" in data
        assert "source_counts" in data


class TestGraphSearchEndpoint:
    def test_graph_search_requires_query(self, client):
        resp = client.get("/graph/search")
        assert resp.status_code == 422  # missing required param

    @pytest.mark.asyncio
    async def test_graph_search_returns_results(self, client):
        with patch("main._graphiti_client") as mock_gc:
            mock_gc.search = AsyncMock(return_value=[
                {"text": "Rust is a systems language", "score": 0.95},
            ])
            resp = client.get("/graph/search?query=Rust")
            assert resp.status_code == 200
            data = resp.json()
            assert data["query"] == "Rust"
            assert len(data["results"]) == 1
            assert data["results"][0]["score"] == 0.95
