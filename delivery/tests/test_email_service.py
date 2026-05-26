from unittest.mock import MagicMock, patch
from delivery.email_service import EmailService


def test_fetch_top_content_uses_api_client():
    mock_client = MagicMock()
    mock_client.fetch_top_content.return_value = [
        {
            "id": "1",
            "title": "API Article",
            "url": "https://api.com",
            "summary": "From API",
            "signal_strength": 0.9,
            "categories": ["AI/ML"],
            "sentiment": "positive",
        }
    ]

    svc = EmailService(
        smtp_host="smtp.test.com",
        smtp_port=587,
        smtp_user="user",
        smtp_pass="pass",
        from_addr="from@test.com",
        to_addrs=["to@test.com"],
    )
    svc._client = mock_client
    articles = svc.fetch_top_content(limit=5)

    mock_client.fetch_top_content.assert_called_once_with(limit=5, min_signal=0.0)
    assert len(articles) == 1
    assert articles[0]["title"] == "API Article"


def test_signal_badge_high():
    assert EmailService._signal_badge(0.9) == "🔴"


def test_signal_badge_medium():
    assert EmailService._signal_badge(0.6) == "🟡"


def test_signal_badge_low():
    assert EmailService._signal_badge(0.3) == "🔵"


def test_render_digest_with_api_data():
    svc = EmailService()
    articles = [
        {
            "title": "Test",
            "url": "https://test.com",
            "summary": "Summary",
            "signal_strength": 0.9,
            "categories": ["AI/ML"],
            "sentiment": "positive",
        }
    ]
    html = svc.render_digest(articles)
    assert "BroadSpace Daily Digest" in html
    assert "Test" in html