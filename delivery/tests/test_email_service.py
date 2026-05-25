from unittest.mock import MagicMock, patch
from delivery.email_service import EmailService


def test_signal_badge_high():
    assert EmailService._signal_badge(0.9) == "🔴"


def test_signal_badge_medium():
    assert EmailService._signal_badge(0.6) == "🟡"


def test_signal_badge_low():
    assert EmailService._signal_badge(0.3) == "🔵"


def test_render_digest_with_default_template():
    svc = EmailService(db_url="postgresql://dummy")
    mock_article = MagicMock()
    mock_article.title = "Test"
    mock_article.url = "https://test.com"
    mock_article.summary = "Summary"
    mock_article.signal_strength = 0.9
    mock_article.categories = ["AI/ML"]
    mock_article.sentiment = "positive"

    html = svc.render_digest([mock_article])
    assert "BroadSpace Daily Digest" in html
    assert "Test" in html


def test_render_digest_with_file_template():
    import os
    template_dir = os.path.join(os.path.dirname(__file__), "..", "..", "templates")
    os.makedirs(template_dir, exist_ok=True)
    template_path = os.path.join(template_dir, "daily_digest.html")
    with open(template_path, "w") as f:
        f.write("<html><body><h1>{{date}}</h1>{% for a in articles %}<p>{{a.title}}</p>{% endfor %}</body></html>")

    svc = EmailService(db_url="postgresql://dummy")
    mock_article = MagicMock()
    mock_article.title = "AI News"
    mock_article.url = "https://ai.com"
    mock_article.summary = "AI summary"
    mock_article.signal_strength = 0.8
    mock_article.categories = ["AI/ML"]
    mock_article.sentiment = "positive"

    html = svc.render_digest([mock_article])
    assert "AI News" in html
    assert "2026" in html