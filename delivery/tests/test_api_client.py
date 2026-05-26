from unittest.mock import patch, MagicMock
from delivery.api_client import ApiClient


def test_fetch_top_content_success():
    mock_response = MagicMock()
    mock_response.json.return_value = [
        {
            "id": "1",
            "title": "Test Article",
            "url": "https://test.com",
            "summary": "Summary",
            "signal_strength": 0.9,
            "categories": ["AI/ML"],
            "sentiment": "positive",
        }
    ]
    mock_response.raise_for_status = MagicMock()

    with patch("delivery.api_client.requests.get", return_value=mock_response) as mock_get:
        client = ApiClient(base_url="http://api:8000")
        result = client.fetch_top_content(limit=5, min_signal=0.5)

        mock_get.assert_called_once_with(
            "http://api:8000/content",
            params={"limit": 5, "min_signal": 0.5},
            timeout=30,
        )
        assert len(result) == 1
        assert result[0]["title"] == "Test Article"


def test_fetch_top_content_api_error():
    from requests import HTTPError

    mock_response = MagicMock()
    mock_response.raise_for_status.side_effect = HTTPError("API Error")

    with patch("delivery.api_client.requests.get", return_value=mock_response):
        client = ApiClient(base_url="http://api:8000")
        try:
            client.fetch_top_content()
            assert False, "Should have raised"
        except HTTPError:
            pass
