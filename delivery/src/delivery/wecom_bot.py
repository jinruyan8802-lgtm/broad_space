import os
from typing import Optional

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False


class WeComBot:
    @staticmethod
    def _signal_badge(signal: float) -> str:
        if signal >= 0.8:
            return "🔴"
        if signal >= 0.5:
            return "🟡"
        return "🔵"

    def __init__(self, webhook_url: Optional[str] = None):
        self.webhook_url = webhook_url or os.environ.get("WECOM_WEBHOOK_URL", "")

    def send_markdown(self, title: str, content: str) -> dict:
        if not REQUESTS_AVAILABLE:
            raise RuntimeError("requests library not installed")
        payload = {
            "msgtype": "markdown",
            "markdown": {
                "content": f"**{title}**\n\n{content}",
            },
        }
        resp = requests.post(self.webhook_url, json=payload, timeout=30)
        resp.raise_for_status()
        return resp.json()

    def send_digest(self, articles: list[dict]):
        lines = [f"📰 **BroadSpace {len(articles)} 条精选**"]
        for a in articles[:5]:
            badge = self._signal_badge(a.get("signal_strength", 0))
            lines.append(
                f"{badge} [{a['title']}]({a['url']}) — "
                f"信号强度 {a.get('signal_strength', 0):.2f}"
            )
        self.send_markdown("BroadSpace 早报", "\n".join(lines))