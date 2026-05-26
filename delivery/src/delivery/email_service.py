import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from jinja2 import Template

from delivery.api_client import ApiClient


class EmailService:
    def __init__(
        self,
        api_url: Optional[str] = None,
        smtp_host: Optional[str] = None,
        smtp_port: Optional[int] = None,
        smtp_user: Optional[str] = None,
        smtp_pass: Optional[str] = None,
        from_addr: Optional[str] = None,
        to_addrs: Optional[list[str]] = None,
    ):
        self._client = ApiClient(base_url=api_url or os.environ.get("API_URL"))

        self.smtp_host = smtp_host or os.environ.get("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = smtp_port or int(os.environ.get("SMTP_PORT", "587"))
        self.smtp_user = smtp_user or os.environ.get("SMTP_USER", "")
        self.smtp_pass = smtp_pass or os.environ.get("SMTP_PASS", "")
        self.from_addr = from_addr or os.environ.get("FROM_EMAIL", "broadspace@example.com")
        to_env = os.environ.get("TO_EMAILS", "")
        self.to_addrs = to_addrs or ([e.strip() for e in to_env.split(",") if e.strip()] if to_env else [])

        self._template_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "templates", "daily_digest.html"
        )

    def fetch_top_content(self, limit: int = 10) -> list[dict]:
        return self._client.fetch_top_content(limit=limit, min_signal=0.0)

    def render_digest(self, articles: list[dict]) -> str:
        template_path = self._template_path
        if os.path.exists(template_path):
            with open(template_path) as f:
                template = Template(f.read())
        else:
            template = Template(self._default_template())

        return template.render(
            date=datetime.now().strftime("%Y-%m-%d"),
            articles=articles,
            badge=self._signal_badge,
        )

    @staticmethod
    def _signal_badge(signal: float) -> str:
        if signal >= 0.8:
            return "🔴"
        if signal >= 0.5:
            return "🟡"
        return "🔵"

    @staticmethod
    def _default_template() -> str:
        return """<html><body><h1>BroadSpace Daily Digest - {{date}}</h1>
        {% for a in articles %}<div style='margin-bottom:20px;border-bottom:1px solid #eee;'>
        <h3>{{badge(a.signal_strength)}} <a href='{{a.url}}'>{{a.title}}</a></h3>
        <p>{{a.summary}}</p><small>Signal: {{a.signal_strength:.2f}} | Categories: {{a.categories|join(', ')}}</small>
        </div>{% endfor %}</body></html>"""

    def send(self) -> None:
        articles = self.fetch_top_content()
        if not articles:
            print("No articles to send.")
            return

        if not self.to_addrs:
            print("No recipients configured (TO_EMAILS env var).")
            return

        msg = MIMEMultipart("alternative")
        msg["Subject"] = f"BroadSpace Daily Digest — {datetime.now().strftime('%Y-%m-%d')}"
        msg["From"] = self.from_addr
        msg["To"] = ", ".join(self.to_addrs)

        html = self.render_digest(articles)
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
            server.starttls()
            server.login(self.smtp_user, self.smtp_pass)
            server.sendmail(self.from_addr, self.to_addrs, msg.as_string())
        print(f"Email sent to {len(self.to_addrs)} recipients.")