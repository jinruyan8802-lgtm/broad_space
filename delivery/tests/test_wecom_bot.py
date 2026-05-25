from unittest.mock import patch, MagicMock
from delivery.wecom_bot import WeComBot


def test_signal_badge_in_digest():
    """Test markdown content contains correct signal badge."""
    with patch("delivery.wecom_bot.REQUESTS_AVAILABLE", True):
        with patch("delivery.wecom_bot.requests.post") as mock_post:
            mock_post.return_value.json.return_value = {"errcode": 0}
            mock_post.return_value.raise_for_status = lambda: None
            bot = WeComBot("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test")
            bot.send_digest([
                {"title": "AI News", "url": "https://ai.com", "signal_strength": 0.9},
            ])
            call_args = mock_post.call_args
            payload = call_args[1]["json"]
            content = payload["markdown"]["content"]
            assert "🔴" in content  # high signal = red


def test_send_markdown_called():
    with patch("delivery.wecom_bot.REQUESTS_AVAILABLE", True):
        with patch("delivery.wecom_bot.requests.post") as mock_post:
            mock_post.return_value.json.return_value = {"errcode": 0}
            mock_post.return_value.raise_for_status = lambda: None
            bot = WeComBot("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test")
            bot.send_markdown("Test", "Hello")
            assert mock_post.called