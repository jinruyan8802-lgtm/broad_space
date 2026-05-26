# Email Digest + WeCom Bot 完整接入 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 delivery 服务从原型升级为生产就绪的 Docker 化服务，支持 API 内容获取、CLI 入口、健康检查和非阻塞调度器。

**Architecture:** delivery 服务通过 HTTP API（而非直连数据库）获取内容，使用 BackgroundScheduler 定时推送邮件和 WeCom 消息，同时暴露轻量级 HTTP 健康检查端点。所有环境变量与 API 模块保持一致。

**Tech Stack:** Python 3.12, APScheduler, requests, Jinja2, SMTP, http.server, Docker

---

## File Structure

| File | Responsibility |
|------|---------------|
| `delivery/src/delivery/__main__.py` | CLI 入口：解析 `--mode` 参数 |
| `delivery/src/delivery/api_client.py` | 封装对 FastAPI `/content` 的 HTTP 调用 |
| `delivery/src/delivery/email_service.py` | 邮件服务：通过 api_client 获取内容，SMTP 发送 |
| `delivery/src/delivery/wecom_bot.py` | WeCom 机器人：Markdown 推送，完整信号徽章 |
| `delivery/src/delivery/scheduler.py` | BackgroundScheduler + 健康检查 HTTP 服务 |
| `delivery/Dockerfile` | delivery 服务的 Docker 镜像 |
| `docker-compose.yml` | 添加 delivery 服务配置 |
| `delivery/tests/test_api_client.py` | api_client 的单元测试 |
| `delivery/tests/test_scheduler.py` | scheduler 的单元测试 |

---

### Task 1: API 客户端 (api_client.py)

**Files:**
- Create: `delivery/src/delivery/api_client.py`
- Test: `delivery/tests/test_api_client.py`

- [ ] **Step 1: Write the failing test**

```python
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
    mock_response.raise_for_status = lambda: None

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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /home/jinru/workon/broad_space/delivery && pytest tests/test_api_client.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'delivery.api_client'`

- [ ] **Step 3: Write minimal implementation**

```python
import os
from typing import Optional

import requests


class ApiClient:
    def __init__(self, base_url: Optional[str] = None):
        self.base_url = base_url or os.environ.get("API_URL", "http://localhost:8000")

    def fetch_top_content(self, limit: int = 10, min_signal: float = 0.0) -> list[dict]:
        resp = requests.get(
            f"{self.base_url}/content",
            params={"limit": limit, "min_signal": min_signal},
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_api_client.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add delivery/src/delivery/api_client.py delivery/tests/test_api_client.py
git commit -m "feat(delivery): add ApiClient for HTTP content fetching"
```

---

### Task 2: 重构 EmailService 使用 API 客户端

**Files:**
- Modify: `delivery/src/delivery/email_service.py` (full rewrite)
- Test: `delivery/tests/test_email_service.py`

- [ ] **Step 1: Write the failing test**

```python
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_email_service.py -v`
Expected: FAIL — `AttributeError: 'EmailService' object has no attribute '_client'`

- [ ] **Step 3: Write implementation**

```python
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
        self._client = ApiClient(base_url=api_url)

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_email_service.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add delivery/src/delivery/email_service.py delivery/tests/test_email_service.py
git commit -m "refactor(delivery): EmailService uses ApiClient instead of DB"
```

---

### Task 3: 修复 WeCom Bot 信号徽章

**Files:**
- Modify: `delivery/src/delivery/wecom_bot.py`
- Test: `delivery/tests/test_wecom_bot.py`

- [ ] **Step 1: Write the failing test**

```python
from unittest.mock import patch, MagicMock
from delivery.wecom_bot import WeComBot


def test_signal_badge_all_levels():
    """Test all three signal badge levels are rendered correctly."""
    with patch("delivery.wecom_bot.REQUESTS_AVAILABLE", True):
        with patch("delivery.wecom_bot.requests.post") as mock_post:
            mock_post.return_value.json.return_value = {"errcode": 0}
            mock_post.return_value.raise_for_status = lambda: None
            bot = WeComBot("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test")
            bot.send_digest([
                {"title": "High", "url": "https://h.com", "signal_strength": 0.9},
                {"title": "Medium", "url": "https://m.com", "signal_strength": 0.6},
                {"title": "Low", "url": "https://l.com", "signal_strength": 0.3},
            ])
            call_args = mock_post.call_args
            payload = call_args[1]["json"]
            content = payload["markdown"]["content"]
            assert "🔴" in content
            assert "🟡" in content
            assert "🔵" in content


def test_send_markdown_called():
    with patch("delivery.wecom_bot.REQUESTS_AVAILABLE", True):
        with patch("delivery.wecom_bot.requests.post") as mock_post:
            mock_post.return_value.json.return_value = {"errcode": 0}
            mock_post.return_value.raise_for_status = lambda: None
            bot = WeComBot("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test")
            bot.send_markdown("Test", "Hello")
            assert mock_post.called
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_wecom_bot.py -v`
Expected: FAIL — `AssertionError: assert '🔵' in '...'` (low signal badge missing)

- [ ] **Step 3: Write implementation**

```python
import os
from typing import Optional

try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False


class WeComBot:
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

    @staticmethod
    def _signal_badge(signal: float) -> str:
        if signal >= 0.8:
            return "🔴"
        if signal >= 0.5:
            return "🟡"
        return "🔵"

    def send_digest(self, articles: list[dict]) -> None:
        lines = [f"📰 **BroadSpace {len(articles)} 条精选**"]
        for a in articles[:5]:
            badge = self._signal_badge(a.get("signal_strength", 0))
            lines.append(
                f"{badge} [{a['title']}]({a['url']}) — "
                f"信号强度 {a.get('signal_strength', 0):.2f}"
            )
        self.send_markdown("BroadSpace 早报", "\n".join(lines))
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_wecom_bot.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add delivery/src/delivery/wecom_bot.py delivery/tests/test_wecom_bot.py
git commit -m "fix(delivery): WeComBot supports all three signal badge levels"
```

---

### Task 4: 重构 Scheduler（BackgroundScheduler + 健康检查）

**Files:**
- Create: `delivery/src/delivery/health_server.py`
- Modify: `delivery/src/delivery/scheduler.py` (full rewrite)
- Test: `delivery/tests/test_scheduler.py`

- [ ] **Step 1: Write the failing test**

```python
from unittest.mock import patch, MagicMock
import threading
import time
from delivery.scheduler import DeliveryScheduler


def test_scheduler_adds_jobs():
    with patch("delivery.scheduler.BackgroundScheduler") as MockScheduler:
        mock_sched = MagicMock()
        MockScheduler.return_value = mock_sched

        ds = DeliveryScheduler()
        ds.start()

        assert mock_sched.add_job.call_count == 3
        mock_sched.start.assert_called_once()


def test_health_server_responds():
    from delivery.health_server import HealthServer
    import urllib.request

    server = HealthServer(port=0)  # auto-assign port
    thread = threading.Thread(target=server.start, daemon=True)
    thread.start()
    time.sleep(0.5)

    port = server.server_address[1]
    with urllib.request.urlopen(f"http://localhost:{port}/health") as resp:
        assert resp.status == 200
        body = resp.read().decode()
        assert "ok" in body

    server.shutdown()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest tests/test_scheduler.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'delivery.health_server'`

- [ ] **Step 3: Write implementation**

`delivery/src/delivery/health_server.py`:

```python
import json
from http.server import HTTPServer, BaseHTTPRequestHandler


class HealthHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default logging

    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({"status": "ok"}).encode())
        else:
            self.send_response(404)
            self.end_headers()


class HealthServer:
    def __init__(self, port: int = 8080):
        self.server = HTTPServer(("0.0.0.0", port), HealthHandler)
        self.port = port

    @property
    def server_address(self):
        return self.server.server_address

    def start(self):
        self.server.serve_forever()

    def shutdown(self):
        self.server.shutdown()
```

`delivery/src/delivery/scheduler.py`:

```python
import os
import sys
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from delivery.email_service import EmailService
from delivery.wecom_bot import WeComBot
from delivery.health_server import HealthServer


class DeliveryScheduler:
    def __init__(self):
        self.scheduler = BackgroundScheduler()
        self.health_server = HealthServer(port=8080)
        self._health_thread: threading.Thread | None = None

    def _run_email_job(self):
        print("[scheduler] Running email digest job")
        try:
            svc = EmailService()
            svc.send()
        except Exception as e:
            print(f"[scheduler] Email job failed: {e}")

    def _run_wecom_job(self, label: str = "morning"):
        print(f"[scheduler] Running WeCom {label} job")
        try:
            bot = WeComBot()
            if not bot.webhook_url:
                print("[scheduler] WECOM_WEBHOOK_URL not set, skipping")
                return
            svc = EmailService()
            articles = svc.fetch_top_content(limit=5)
            if articles:
                bot.send_digest(articles)
        except Exception as e:
            print(f"[scheduler] WeCom job failed: {e}")

    def start(self):
        # Email digest: 8:00 AM daily
        self.scheduler.add_job(
            self._run_email_job,
            CronTrigger(hour=8, minute=0),
            id="email_digest",
            name="Daily Email Digest",
        )

        # WeCom morning: 8:00 AM daily
        self.scheduler.add_job(
            lambda: self._run_wecom_job("morning"),
            CronTrigger(hour=8, minute=0),
            id="wecom_morning",
            name="WeCom Morning Digest",
        )

        # WeCom evening: 6:00 PM daily
        self.scheduler.add_job(
            lambda: self._run_wecom_job("evening"),
            CronTrigger(hour=18, minute=0),
            id="wecom_evening",
            name="WeCom Evening Digest",
        )

        self.scheduler.start()

        # Start health check server in background thread
        self._health_thread = threading.Thread(target=self.health_server.start, daemon=True)
        self._health_thread.start()

        print("Scheduler started. Jobs:")
        print("  [email_digest]      Daily Email Digest     — 08:00")
        print("  [wecom_morning]     WeCom Morning Digest   — 08:00")
        print("  [wecom_evening]     WeCom Evening Digest   — 18:00")
        print("  Health check:       http://localhost:8080/health")
        print()

    def stop(self):
        self.scheduler.shutdown()
        self.health_server.shutdown()
        print("Scheduler stopped.")


def run_email_job():
    """One-shot email send (for CLI --mode email)."""
    svc = EmailService()
    svc.send()


def run_wecom_job():
    """One-shot WeCom push (for CLI --mode wecom)."""
    bot = WeComBot()
    svc = EmailService()
    articles = svc.fetch_top_content(limit=5)
    if articles:
        bot.send_digest(articles)


if __name__ == "__main__":
    ds = DeliveryScheduler()
    ds.start()
    try:
        import time
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        ds.stop()
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest tests/test_scheduler.py -v`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add delivery/src/delivery/health_server.py delivery/src/delivery/scheduler.py delivery/tests/test_scheduler.py
git commit -m "feat(delivery): BackgroundScheduler with health check HTTP server"
```

---

### Task 5: CLI 入口 (__main__.py)

**Files:**
- Create: `delivery/src/delivery/__main__.py`
- Modify: `delivery/pyproject.toml` (添加 requests 依赖)

- [ ] **Step 1: Write implementation**

`delivery/src/delivery/__main__.py`:

```python
import argparse
import sys

from delivery.email_service import EmailService
from delivery.wecom_bot import WeComBot
from delivery.scheduler import DeliveryScheduler, run_email_job, run_wecom_job


def main():
    parser = argparse.ArgumentParser(description="BroadSpace Delivery Service")
    parser.add_argument(
        "--mode",
        choices=["email", "wecom", "scheduler"],
        default="scheduler",
        help="Run mode: email (one-shot), wecom (one-shot), or scheduler (daemon)",
    )
    args = parser.parse_args()

    if args.mode == "email":
        print("Sending email digest...")
        run_email_job()
    elif args.mode == "wecom":
        print("Sending WeCom digest...")
        run_wecom_job()
    elif args.mode == "scheduler":
        ds = DeliveryScheduler()
        ds.start()
        try:
            import time
            while True:
                time.sleep(1)
        except (KeyboardInterrupt, SystemExit):
            ds.stop()
            sys.exit(0)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Update pyproject.toml**

```toml
[project]
name = "broadspace-delivery"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
    "sqlalchemy>=2.0",
    "psycopg2-binary>=2.9",
    "jinja2>=3.1",
    "apscheduler>=3.10",
    "requests>=2.31",
]

[project.optional-dependencies]
dev = ["pytest", "pytest-mock"]
```

- [ ] **Step 3: Test CLI**

Run: `cd /home/jinru/workon/broad_space/delivery && pip install -e . > /dev/null 2>&1 && python -m delivery --help`
Expected: 显示帮助信息，包含 `--mode` 选项

Run: `python -m delivery --mode email`
Expected: 输出 "Sending email digest..."（可能因 SMTP 配置缺失而跳过发送）

- [ ] **Step 4: Commit**

```bash
git add delivery/src/delivery/__main__.py delivery/pyproject.toml
git commit -m "feat(delivery): add CLI entry point with --mode flag"
```

---

### Task 6: Dockerfile

**Files:**
- Create: `delivery/Dockerfile`

- [ ] **Step 1: Write Dockerfile**

```dockerfile
FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir -e "."

# Copy source code
COPY src/ ./src/
COPY templates/ ./templates/

EXPOSE 8080

CMD ["python", "-m", "delivery", "--mode", "scheduler"]
```

- [ ] **Step 2: Build and verify**

Run: `cd /home/jinru/workon/broad_space/delivery && docker build -t broadspace-delivery:test .`
Expected: Build succeeds

Run: `docker run --rm broadspace-delivery:test python -m delivery --help`
Expected: 显示 CLI 帮助

- [ ] **Step 3: Commit**

```bash
git add delivery/Dockerfile
git commit -m "feat(delivery): add Dockerfile for containerized delivery service"
```

---

### Task 7: docker-compose 集成

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Read current docker-compose.yml**

```bash
cat /home/jinru/workon/broad_space/docker-compose.yml
```

- [ ] **Step 2: Add delivery service**

在 `docker-compose.yml` 的 `services:` 下添加：

```yaml
delivery:
  build:
    context: ./delivery
  container_name: broadspace-delivery
  environment:
    - API_URL=http://api:8000
    - DB_HOST=postgres
    - DB_USER=broadspace
    - DB_PASSWORD=change_me_in_production
    - DB_NAME=broadspace
    - SMTP_HOST=${SMTP_HOST:-smtp.gmail.com}
    - SMTP_PORT=${SMTP_PORT:-587}
    - SMTP_USER=${SMTP_USER:-}
    - SMTP_PASS=${SMTP_PASS:-}
    - FROM_EMAIL=${FROM_EMAIL:-broadspace@example.com}
    - TO_EMAILS=${TO_EMAILS:-}
    - WECOM_WEBHOOK_URL=${WECOM_WEBHOOK_URL:-}
  depends_on:
    api:
      condition: service_started
    postgres:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8080/health')"]
    interval: 30s
    timeout: 5s
    retries: 3
```

- [ ] **Step 3: Verify docker-compose config**

Run: `docker compose config > /dev/null 2>&1 && echo "OK" || echo "INVALID"`
Expected: OK

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(delivery): add delivery service to docker-compose"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: Install delivery dependencies**

Run: `cd /home/jinru/workon/broad_space/delivery && pip install -e ".[dev]"`
Expected: 安装成功

- [ ] **Step 2: Run all tests**

Run: `pytest tests/ -v`
Expected: 全部通过

- [ ] **Step 3: Test CLI one-shot modes**

Run: `python -m delivery --mode email`
Expected: 输出 "No recipients configured" 或成功发送（取决于环境变量）

Run: `python -m delivery --mode wecom`
Expected: 输出 "WECOM_WEBHOOK_URL not set" 或成功推送

- [ ] **Step 4: Test health check**

Run (in one terminal): `python -m delivery --mode scheduler`
Run (in another): `curl http://localhost:8080/health`
Expected: `{"status": "ok"}`

- [ ] **Step 5: Commit**

```bash
git commit -m "test(delivery): verify all modes and health check"
```

---

## Self-Review

**1. Spec coverage:**
- [x] 统一环境变量 — Task 2 (EmailService 不再读取 DATABASE_URL)
- [x] 通过 API 获取内容 — Task 1 + Task 2 (ApiClient + EmailService 重构)
- [x] Docker 化 — Task 6 (Dockerfile)
- [x] CLI 入口 — Task 5 (`__main__.py`)
- [x] 信号徽章完整 — Task 3 (WeComBot._signal_badge)
- [x] 非阻塞调度器 — Task 4 (BackgroundScheduler)
- [x] 健康检查 — Task 4 (health_server.py + Task 6 docker-compose)

**2. Placeholder scan:** 无 TBD/TODO/"implement later" 等占位符。

**3. Type consistency:** `ApiClient.fetch_top_content` 返回 `list[dict]`，与 `EmailService.render_digest` 参数类型一致；`WeComBot._signal_badge` 与 `EmailService._signal_badge` 签名一致。
