# PRD: Signal/Analytics Dashboard

**项目:** BroadSpace 子项目 D — Signal/Analytics Dashboard
**日期:** 2026/05/26
**状态:** 设计中

---

## 1. 背景与问题

当前系统已有以下可观测性基础设施：

| 组件 | 现状 |
|-----|------|
| Prometheus | 抓取 `api:8000/metrics` 和 `processor:8080/metrics` |
| Grafana | 运行在 port 3001，有 API 面板 |
| FastAPI `/metrics` | `api_requests_total` (Counter) + `api_request_duration_seconds` (Histogram) |
| PostgreSQL | 存储 `processed_articles` 含 `signal_strength`, `categories`, `sentiment` 等 |

**问题：**
- 没有内容分析仪表板（Signal 分布、分类统计、情感趋势）
- 没有内容处理量时序图（Articles/day, Articles/hour）
- 现有 Grafana 面板仅有 API 请求指标，缺少业务指标

---

## 2. 目标

1. **新增 API 端点** `/analytics` — 返回 dashboard 所需聚合数据
2. **新增 Dashboard 页面** `src/app/dashboard/page.tsx` — 可视化展示
3. **展示内容：**
   - Signal 强度分布（高/中/低 三档计数 + 百分比）
   - 分类统计（Top 10 categories bar chart）
   - 情感分布（positive/neutral/negative 饼图）
   - 内容处理量趋势（近 7 天 line chart）
   - 源分布（RSS / HackerNews / GitHub 等）
4. **Grafana 集成** — 在现有 Grafana 中添加业务监控面板

---

## 3. 技术方案

### 3.1 新增 API 端点 `/analytics`

```python
from fastapi import Query

@app.get("/analytics")
def get_analytics(days: int = Query(7, ge=1, le=90)):
    """
    返回仪表板聚合数据:
    - signal_distribution: {high: N, mid: N, low: N}
    - category_counts: [{"category": "AI/ML", "count": N}, ...]
    - sentiment_counts: {positive: N, neutral: N, negative: N}
    - volume_timeline: [{"date": "2026-05-20", "count": N}, ...]
    - source_counts: [{"source": "HackerNews", "count": N}, ...]
    """
```

SQL 查询基于 `processed_at` 时间范围过滤。

### 3.2 Dashboard 前端页面

新页面 `src/app/dashboard/page.tsx`（客户端组件）：

```
┌─────────────────────────────────────────────────────┐
│ NavBar [Feed] [Graph] [Dashboard]                   │
├─────────────────────────────────────────────────────┤
│ 仪表板标题：BroadSpace Analytics                    │
├───────────────────┬─────────────────────────────────┤
│ Signal 分布卡片   │ 情感分布卡片                    │
│ 🔴 高 (≥0.8): 45  │ 😊 Positive: 120               │
│ 🟡 中 (0.5-0.8): │ 😐 Neutral: 80                  │
│ 🔵 低 (<0.5): 20 │ 😔 Negative: 30                 │
├───────────────────┴─────────────────────────────────┤
│ 内容处理量趋势 (近7天)  [Line Chart]                │
├─────────────────────────────────────────────────────┤
│ 分类统计 Top 10 [Bar Chart]  │  来源分布 [Pie]    │
└─────────────────────────────────────────────────────┘
```

组件：
- `src/components/dashboard/SignalCard.tsx` — Signal 分布
- `src/components/dashboard/SentimentCard.tsx` — 情感分布
- `src/components/dashboard/VolumeChart.tsx` — 时序折线图
- `src/components/dashboard/CategoryChart.tsx` — Top10 bar chart
- `src/components/dashboard/SourceChart.tsx` — 来源饼图

### 3.3 Recharts 图表库

使用 `recharts`（轻量、React 原生、TypeScript 支持好）：

```bash
npm install recharts
```

---

## 4. 非目标（本次）

- 不实现告警规则（Alerting）
- 不实现多租户 / 权限管理
- 不替换 Grafana（继续用作专业监控，Grafana dashboard 补充展示）

---

## 5. 验收标准

- [ ] `GET /analytics?days=7` 返回正确的 JSON 聚合数据
- [ ] Dashboard 页面加载时显示 skeleton/loading 状态
- [ ] Signal 分布、情感分布、分类统计、来源分布正确渲染
- [ ] 内容处理量折线图显示近 7 天趋势
- [ ] 点击分类 chip 可筛选（可选）
- [ ] Playwright 验证页面无 console error
- [ ] Grafana 新增 2 个面板（Signal 监控 + 内容处理量）

---

## 6. 依赖关系

- Project A（Neo4j Knowledge Graph）— 已完成
- Project B（Next.js Frontend）— 已完成
- Project C（Email + WeCom）— 已完成

所有依赖已就绪，可独立开发。