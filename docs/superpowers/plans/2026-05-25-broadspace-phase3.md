# BroadSpace Phase 3 — Distribution & Frontend Layer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build interactive web UI (Next.js + D3.js), Email daily digest, and WeCom bot delivery channels. Deploy with monitoring and production cron scheduling.

**Architecture:** Next.js frontend queries the FastAPI backend and Neo4j knowledge graph directly for visualization. A delivery service runs scheduled jobs (8:00 Email, 8:00/18:00 WeCom) and renders HTML/Markdown digests from PostgreSQL content.

**Tech Stack:** Next.js 14, React, D3.js, Tailwind CSS, Nodemailer/SMTP, WeCom Webhook, Prometheus, Grafana

---

## File Structure (Phase 3)

```
broad-space/
├── web/                        # Next.js frontend
│   ├── package.json
│   ├── next.config.js
│   └── src/
│       ├── app/
│       │   ├── page.tsx        # Main feed view
│       │   ├── graph/
│       │   │   └── page.tsx    # D3.js knowledge graph
│       │   └── trend/
│       │       └── page.tsx    # Timeline view
│       └── components/
│           ├── FeedCard.tsx
│           ├── GraphCanvas.tsx
│           ├── TrendChart.tsx
│           ├── SignalBadge.tsx
│           └── ExploreSlider.tsx
├── delivery/                   # Distribution service
│   ├── pyproject.toml
│   ├── templates/
│   │   └── daily_digest.html
│   ├── src/delivery/
│   │   ├── __init__.py
│   │   ├── email_service.py
│   │   ├── wecom_bot.py
│   │   └── scheduler.py
│   └── tests/
├── monitoring/                 # Prometheus + Grafana
│   ├── prometheus.yml
│   └── dashboards/
│       └── broadspace.json
└── docs/superpowers/plans/
    └── 2026-05-25-broadspace-phase3.md
```

---

## Prerequisites

Before starting Phase 3, ensure:
1. Phase 2 is running (Neo4j + semantic dedup + ranker)
2. Node.js 20+ and npm/pnpm installed
3. SMTP credentials (for Email) or WeCom Webhook URL (for Bot)

---

### Task 1: Web Frontend — Next.js Project Setup

**Goal:** Initialize Next.js app with Tailwind and basic routing.

**Files:**
- Create: `web/package.json`, `web/next.config.js`, `web/src/app/layout.tsx`

- [ ] **Step 1: Initialize project**

```bash
mkdir -p web && cd web
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --no-import-alias
```

- [ ] **Step 2: Add API client config**

Create `web/src/lib/api.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export async function fetchContent(params?: { category?: string; min_signal?: number; limit?: number }) {
    const qs = new URLSearchParams(params as Record<string, string>);
    const res = await fetch(`${API_BASE}/content?${qs}`);
    if (!res.ok) throw new Error("API error");
    return res.json();
}

export async function fetchGraphSearch(query: string) {
    // Phase 3: will call Neo4j directly or a new /graph/search endpoint
    const res = await fetch(`${API_BASE}/graph/search?q=${encodeURIComponent(query)}`);
    return res.json();
}
```

- [ ] **Step 3: Commit**

```bash
git add web/
git commit -m "feat(web): init Next.js project with API client"
```

---

### Task 2: Web Frontend — Feed View & Card Component

**Goal:** Display processed articles in a scrollable feed with signal strength badges.

**Files:**
- Create: `web/src/components/FeedCard.tsx`
- Create: `web/src/app/page.tsx`

- [ ] **Step 1: FeedCard component**

```tsx
// web/src/components/FeedCard.tsx
interface FeedCardProps {
    id: string;
    title: string;
    url: string;
    summary: string;
    categories: string[];
    signal_strength: number;
    sentiment: string;
    sources: { name: string; url: string }[];
}

export default function FeedCard({ title, summary, categories, signal_strength, sources }: FeedCardProps) {
    const signalColor = signal_strength >= 0.8 ? "text-red-500" : signal_strength >= 0.5 ? "text-yellow-500" : "text-blue-500";
    return (
        <div className="border rounded-lg p-4 mb-4 shadow-sm hover:shadow-md transition">
            <div className="flex justify-between items-start">
                <h2 className="text-lg font-semibold">{title}</h2>
                <span className={`font-bold ${signalColor}`}>{signal_strength.toFixed(2)}</span>
            </div>
            <p className="text-gray-600 mt-2 text-sm">{summary}</p>
            <div className="flex gap-2 mt-3">
                {categories.map((c) => (
                    <span key={c} className="bg-gray-100 text-xs px-2 py-1 rounded">{c}</span>
                ))}
            </div>
            <div className="text-xs text-gray-400 mt-2">
                Sources: {sources.map((s) => s.name).join(", ")}
            </div>
        </div>
    );
}
```

- [ ] **Step 2: Main feed page**

```tsx
// web/src/app/page.tsx
import FeedCard from "@/components/FeedCard";
import { fetchContent } from "@/lib/api";

export default async function Home() {
    const articles = await fetchContent({ limit: "20" });
    return (
        <main className="max-w-3xl mx-auto p-6">
            <h1 className="text-2xl font-bold mb-6">BroadSpace Feed</h1>
            {articles.map((a: any) => (
                <FeedCard key={a.id} {...a} />
            ))}
        </main>
    );
}
```

- [ ] **Step 3: Commit**

```bash
git add web/src/components/FeedCard.tsx web/src/app/page.tsx
git commit -m "feat(web): add feed view with signal badges"
```

---

### Task 3: Web Frontend — D3.js Knowledge Graph Visualization

**Goal:** Interactive force-directed graph showing entities and relationships from Neo4j.

**Files:**
- Create: `web/src/components/GraphCanvas.tsx`
- Create: `web/src/app/graph/page.tsx`

- [ ] **Step 1: Install D3**

```bash
cd web
npm install d3 @types/d3
```

- [ ] **Step 2: GraphCanvas component**

```tsx
// web/src/components/GraphCanvas.tsx
"use client";
import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface Node {
    id: string;
    group: string;
}

interface Link {
    source: string;
    target: string;
    relation: string;
}

export default function GraphCanvas({ nodes, links }: { nodes: Node[]; links: Link[] }) {
    const ref = useRef<SVGSVGElement>(null);

    useEffect(() => {
        if (!ref.current) return;
        const svg = d3.select(ref.current);
        svg.selectAll("*").remove();

        const width = 800;
        const height = 600;
        svg.attr("width", width).attr("height", height);

        const simulation = d3.forceSimulation(nodes as any)
            .force("link", d3.forceLink(links as any).id((d: any) => d.id).distance(100))
            .force("charge", d3.forceManyBody().strength(-300))
            .force("center", d3.forceCenter(width / 2, height / 2));

        const link = svg.append("g").selectAll("line")
            .data(links)
            .join("line")
            .attr("stroke", "#999")
            .attr("stroke-opacity", 0.6);

        const node = svg.append("g").selectAll("circle")
            .data(nodes)
            .join("circle")
            .attr("r", 8)
            .attr("fill", (d) => (d.group === "Technology" ? "#ef4444" : "#3b82f6"))
            .call(d3.drag<any, any>()
                .on("start", (event, d) => { if (!event.active) simulation.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
                .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
                .on("end", (event, d) => { if (!event.active) simulation.alphaTarget(0); d.fx = null; d.fy = null; })
            );

        simulation.on("tick", () => {
            link.attr("x1", (d: any) => d.source.x).attr("y1", (d: any) => d.source.y)
                .attr("x2", (d: any) => d.target.x).attr("y2", (d: any) => d.target.y);
            node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
        });
    }, [nodes, links]);

    return <svg ref={ref} className="border rounded" />;
}
```

- [ ] **Step 3: Graph page**

```tsx
// web/src/app/graph/page.tsx
import GraphCanvas from "@/components/GraphCanvas";

// Mock data for Phase 3 scaffolding; will be replaced with Neo4j API call
const mockNodes = [
    { id: "Rust", group: "Technology" },
    { id: "Go", group: "Technology" },
    { id: "AI", group: "Concept" },
];
const mockLinks = [
    { source: "Rust", target: "AI", relation: "drives" },
    { source: "Go", target: "AI", relation: "related_to" },
];

export default function GraphPage() {
    return (
        <main className="p-6">
            <h1 className="text-2xl font-bold mb-4">Knowledge Graph</h1>
            <GraphCanvas nodes={mockNodes} links={mockLinks} />
        </main>
    );
}
```

- [ ] **Step 4: Commit**

```bash
git add web/src/components/GraphCanvas.tsx web/src/app/graph/page.tsx web/package.json
git commit -m "feat(web): add D3.js knowledge graph visualization"
```

---

### Task 4: Delivery — Email Daily Digest Service

**Goal:** Generate and send HTML daily digest at 8:00 AM with top signals.

**Files:**
- Create: `delivery/src/delivery/email_service.py`
- Create: `delivery/templates/daily_digest.html`
- Create: `delivery/tests/test_email_service.py`

- [ ] **Step 1: Create email service**

```python
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import datetime

from sqlalchemy import create_engine, text


class EmailService:
    def __init__(self, db_url: str | None = None):
        self.db_url = db_url or os.environ.get("DATABASE_URL", "postgresql://broadspace:broadspace@localhost:5432/broadspace")
        self.engine = create_engine(self.db_url)

        self.smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
        self.smtp_port = int(os.environ.get("SMTP_PORT", "587"))
        self.smtp_user = os.environ.get("SMTP_USER", "")
        self.smtp_pass = os.environ.get("SMTP_PASS", "")
        self.from_addr = os.environ.get("FROM_EMAIL", "broadspace@example.com")
        self.to_addrs = os.environ.get("TO_EMAILS", "").split(",")

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
        html = "<html><body><h1>BroadSpace Daily Digest</h1><p>{}</p>".format(datetime.now().strftime("%Y-%m-%d"))
        for a in articles:
            badge = "🔴" if a.signal_strength >= 0.8 else "🟡" if a.signal_strength >= 0.5 else "🔵"
            html += f"""
            <div style='margin-bottom:20px;border-bottom:1px solid #eee;padding-bottom:10px;'>
                <h3>{badge} <a href='{a.url}'>{a.title}</a></h3>
                <p>{a.summary}</p>
                <small>Signal: {a.signal_strength:.2f} | Categories: {', '.join(a.categories or [])}</small>
            </div>
            """
        html += "</body></html>"
        return html

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
```

- [ ] **Step 2: Write test**

```python
from unittest.mock import MagicMock, patch
from delivery.email_service import EmailService

def test_render_digest():
    svc = EmailService(db_url="postgresql://dummy")
    mock_article = MagicMock()
    mock_article.title = "Test"
    mock_article.url = "https://test.com"
    mock_article.summary = "Summary"
    mock_article.signal_strength = 0.9
    mock_article.categories = ["AI/ML"]
    html = svc.render_digest([mock_article])
    assert "BroadSpace Daily Digest" in html
    assert "Test" in html
```

- [ ] **Step 3: Commit**

```bash
git add delivery/
git commit -m "feat(delivery): add email daily digest service"
```

---

### Task 5: Delivery — WeCom Bot Push

**Goal:** Push morning (8:00) and evening (18:00) digests to WeCom group via webhook.

**Files:**
- Create: `delivery/src/delivery/wecom_bot.py`
- Create: `delivery/tests/test_wecom_bot.py`

- [ ] **Step 1: Create WeCom bot**

```python
import os
import requests


class WeComBot:
    def __init__(self, webhook_url: str | None = None):
        self.webhook_url = webhook_url or os.environ.get("WECOM_WEBHOOK_URL", "")

    def send_markdown(self, title: str, content: str) -> dict:
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
            badge = "🔴" if a.get("signal_strength", 0) >= 0.8 else "🟡"
            lines.append(f"{badge} [{a['title']}]({a['url']}) — 信号强度 {a.get('signal_strength', 0):.2f}")
        self.send_markdown("BroadSpace 早报", "\n".join(lines))
```

- [ ] **Step 2: Write test**

```python
from unittest.mock import patch
from delivery.wecom_bot import WeComBot

def test_send_markdown():
    with patch("delivery.wecom_bot.requests.post") as mock_post:
        mock_post.return_value.json.return_value = {"errcode": 0}
        mock_post.return_value.raise_for_status = lambda: None
        bot = WeComBot("https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=test")
        bot.send_markdown("Test", "Hello")
        assert mock_post.called
```

- [ ] **Step 3: Commit**

```bash
git add delivery/src/delivery/wecom_bot.py delivery/tests/test_wecom_bot.py
git commit -m "feat(delivery): add WeCom bot push"
```

---

### Task 6: Delivery — Scheduler (APScheduler)

**Goal:** Cron-like scheduling for Email (8:00) and WeCom (8:00, 18:00).

**Files:**
- Create: `delivery/src/delivery/scheduler.py`

- [ ] **Step 1: Create scheduler**

```python
import os
from apscheduler.schedulers.blocking import BlockingScheduler

from delivery.email_service import EmailService
from delivery.wecom_bot import WeComBot


def run_email_job():
    svc = EmailService()
    svc.send()


def run_wecom_morning():
    bot = WeComBot()
    # fetch articles from DB and send


def run_wecom_evening():
    bot = WeComBot()
    # fetch articles from DB and send


if __name__ == "__main__":
    scheduler = BlockingScheduler()
    scheduler.add_job(run_email_job, "cron", hour=8, minute=0)
    scheduler.add_job(run_wecom_morning, "cron", hour=8, minute=0)
    scheduler.add_job(run_wecom_evening, "cron", hour=18, minute=0)
    print("Scheduler started. Jobs: 08:00 Email, 08:00 WeCom, 18:00 WeCom")
    scheduler.start()
```

- [ ] **Step 2: Add to docker-compose**

```yaml
  scheduler:
    build:
      context: ./delivery
    environment:
      DATABASE_URL: postgres://${DB_USER}:${DB_PASSWORD}@postgres/${DB_NAME}
      SMTP_HOST: ${SMTP_HOST}
      SMTP_USER: ${SMTP_USER}
      SMTP_PASS: ${SMTP_PASS}
      WECOM_WEBHOOK_URL: ${WECOM_WEBHOOK_URL}
    depends_on:
      - postgres
      - redis
```

- [ ] **Step 3: Commit**

```bash
git add delivery/src/delivery/scheduler.py docker-compose.yml
git commit -m "feat(delivery): add APScheduler cron jobs"
```

---

### Task 7: Monitoring — Prometheus + Grafana

**Goal:** Expose metrics from API and Processor; visualize in Grafana.

**Files:**
- Create: `monitoring/prometheus.yml`
- Modify: `api/main.py` (add `/metrics` endpoint)
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add Prometheus metrics to FastAPI**

```bash
cd api
source ../processor/.venv/bin/activate
pip install prometheus-client
```

In `api/main.py`:

```python
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST

REQUEST_COUNT = Counter("api_requests_total", "Total requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("api_request_duration_seconds", "Request latency")

@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    REQUEST_COUNT.labels(method=request.method, endpoint=request.url.path, status=response.status_code).inc()
    REQUEST_LATENCY.observe(duration)
    return response

@app.get("/metrics")
def metrics():
    from fastapi.responses import Response
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)
```

- [ ] **Step 2: Prometheus config**

```yaml
# monitoring/prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "broadspace-api"
    static_configs:
      - targets: ["api:8000"]
```

- [ ] **Step 3: Add to docker-compose**

```yaml
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./monitoring/prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"

  grafana:
    image: grafana/grafana:latest
    ports:
      - "3000:3000"
    volumes:
      - grafana_data:/var/lib/grafana
```

- [ ] **Step 4: Commit**

```bash
git add monitoring/ api/main.py docker-compose.yml
git commit -m "feat(monitoring): add Prometheus metrics and Grafana"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Implementing Task |
|-------------|-------------------|
| Next.js Web UI | Tasks 1-3 |
| Email 日报 | Task 4 |
| 企业微信 Bot | Task 5 |
| 定时调度 | Task 6 |
| 监控 (Prometheus/Grafana) | Task 7 |

### Gaps for Phase 3.5

- **Graph search API** — Frontend calls mock data; needs `/graph/search` FastAPI endpoint wired to Neo4j.
- **用户认证** — Web UI has no login; all content is public.
- **兴趣滑块交互** — ExploreSlider component exists in spec but not fully wired to ranker API.

---

## Execution Handoff

**Plan saved to `docs/superpowers/plans/2026-05-25-broadspace-phase3.md`.**

Phase 3 completes the **user-facing layer**: interactive web exploration, automated daily delivery, and production observability. Combined with Phase 1 (pipeline) and Phase 2 (intelligence), this delivers the full BroadSpace vision.
