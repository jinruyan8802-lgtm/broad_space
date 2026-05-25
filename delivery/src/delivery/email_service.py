import os
import smtplib
from datetime import datetime
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from jinja2 import Template
from sqlalchemy import create_engine, text


class EmailService:
    def __init__(
        self,
        db_url: Optional[str] = None,
        smtp_host: Optional[str] = None,
        smtp_port: Optional[int] = None,
        smtp_user: Optional[str] = None,
        smtp_pass: Optional[str] = None,
        from_addr: Optional[str] = None,
        to_addrs: Optional[list[str]] = None,
    ):
        self.db_url = db_url or os.environ.get(
            "DATABASE_URL",
            "postgresql://broadspace:broadspace@localhost:5432/broadspace"
        )
        self.engine = create_engine(self.db_url)

        self.smtp_host = smtp_host or os.environ.get("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = smtp_port or int(os.environ.get("SMTP_PORT", "587"))
        self.smtp_user = smtp_user or os.environ.get("SMTP_USER", "")
        self.smtp_pass = smtp_pass or os.environ.get("SMTP_PASS", "")
        self.from_addr = from_addr or os.environ.get("FROM_EMAIL", "broadspace@example.com")
        self.to_addrs = to_addrs or os.environ.get("TO_EMAILS", "").split(",")

        self._template_path = os.path.join(
            os.path.dirname(__file__), "..", "..", "templates", "daily_digest.html"
        )

    def fetch_top_content(self, limit: int = 10):
        with self.engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT title, url, summary, categories, signal_strength, sentiment
                    FROM processed_articles
                    WHERE processed_at > NOW() - INTERVAL '24 hours'
                    ORDER BY signal_strength DESC
                    LIMIT :limit
                """),
                {"limit": limit},
            ).fetchall()
        return rows

    def render_digest(self, articles: list) -> str:
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

    def send(self):
        articles = self.fetch_top_content()
        if not articles:
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