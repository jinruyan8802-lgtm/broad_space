# PRD: Email Digest + WeCom Bot 完整接入

**项目:** BroadSpace 子项目 C — Email Digest + WeCom Bot 完整接入
**日期:** 2026/05/26
**状态:** 设计中

---

## 1. 背景与问题

当前 `delivery/` 目录已有基础代码，但存在以下问题：

| 问题 | 现状 |
|-----|------|
| 数据库直连 | EmailService 直接连接 PostgreSQL，未通过 FastAPI `/content` API |
| 环境变量不统一 | `DATABASE_URL` 与项目其他模块使用的 `DB_USER/DB_PASSWORD` 不一致 |
| 无 Docker 服务 | docker-compose.yml 中缺少 delivery 服务 |
| 无 CLI 入口 | 只能通过 `python -m delivery.scheduler` 运行，无可配置命令行 |
| 信号徽章不完整 | WeCom bot 只处理 🔴/🟡，缺少 🔵 低信号 |
| 阻塞调度器 | `BlockingScheduler` 不适合容器化（无法响应健康检查） |
| 无健康检查 | 无法通过 Docker healthcheck 验证服务状态 |
| 无 API 集成 | delivery 服务无法调用 FastAPI 获取内容（含 triples 等新字段） |

---

## 2. 目标

1. **统一环境变量** — 与 API 模块一致：使用 `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `DB_HOST`
2. **通过 API 获取内容** — `EmailService.fetch_top_content()` 改为调用 `http://api:8000/content`
3. **Docker 化 delivery** — 添加 Dockerfile + docker-compose 服务
4. **CLI 入口** — `python -m delivery` 支持 `--mode email|wecom|scheduler`
5. **信号徽章完整** — WeCom bot 支持 🔴/🟡/🔵 三档
6. **非阻塞调度器** — 使用 `BackgroundScheduler`，支持健康检查端点
7. **健康检查** — `/health` HTTP 端点，用于 Docker healthcheck

---

## 3. 技术方案

### 3.1 环境变量统一

```bash
# 与 api/main.py 保持一致
DB_USER=broadspace
DB_PASSWORD=change_me_in_production
DB_NAME=broadspace
DB_HOST=postgres

# delivery 特有
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
FROM_EMAIL=broadspace@example.com
TO_EMAILS=admin@example.com
WECOM_WEBHOOK_URL=
API_URL=http://api:8000
```

### 3.2 API 替代数据库直连

```python
# 新：通过 API 获取内容
import requests

def fetch_top_content(self, limit: int = 10):
    resp = requests.get(
        f"{self.api_url}/content",
        params={"limit": limit, "min_signal": 0.5},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()
```

### 3.3 Dockerfile

基于 `python:3.12-slim`，使用 `uv` 安装依赖（与 API 一致）：

```dockerfile
FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install -e .
COPY src/ ./src/
COPY templates/ ./templates/
CMD ["python", "-m", "delivery", "--mode", "scheduler"]
```

### 3.4 docker-compose 服务

```yaml
delivery:
  build: ./delivery
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

### 3.5 CLI 入口

```bash
# 发送邮件
python -m delivery --mode email

# 发送 WeCom 推送
python -m delivery --mode wecom

# 启动定时调度器（默认）
python -m delivery --mode scheduler
```

### 3.6 健康检查 HTTP 服务

使用 `http.server` 或 `fastapi` 在 8080 端口提供 `/health`：

```python
from http.server import HTTPServer, BaseHTTPRequestHandler

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'{"status":"ok"}')
        else:
            self.send_response(404)
            self.end_headers()
```

---

## 4. 非目标（本次）

- 不添加邮件订阅管理（多用户、退订）
- 不实现 WeCom 企业号 OAuth 认证
- 不添加短信推送
- 不替换现有的 Jinja2 模板引擎

---

## 5. 验收标准

- [ ] `docker compose up delivery` 启动成功，healthcheck 通过
- [ ] `python -m delivery --mode email` 能发送邮件（使用 mock SMTP）
- [ ] `python -m delivery --mode wecom` 能推送 WeCom 消息（使用 mock webhook）
- [ ] `python -m delivery --mode scheduler` 启动定时任务，/health 返回 200
- [ ] WeCom bot 的 🔴/🟡/🔵 三档信号徽章正确显示
- [ ] 环境变量与 API 模块完全一致（DB_USER/DB_PASSWORD 等）
- [ ] pytest 全部通过
