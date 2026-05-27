# Signal/Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 BroadSpace 添加内容分析仪表板，包含 Signal 分布、分类统计、情感趋势、内容处理量等可视化。

**Architecture:** 新增 FastAPI `/analytics` 端点聚合 PostgreSQL 数据（Signal、分类、情感、源、时间序列），前端 Dashboard 页面使用 Recharts 渲染图表，Grafana 新增业务监控面板。

**Tech Stack:** Python (FastAPI), PostgreSQL SQL 查询, Next.js 14, Recharts, TypeScript

---

## File Structure

| File | Responsibility |
|------|---------------|
| `api/main.py` | 新增 `/analytics` 端点 |
| `api/models.py` | 新增 `AnalyticsResponse` Pydantic 模型 |
| `web/src/lib/api.ts` | 新增 `fetchAnalytics()` 函数 |
| `web/src/app/dashboard/page.tsx` | Dashboard 主页面（客户端组件） |
| `web/src/components/dashboard/SignalCard.tsx` | Signal 分布卡片 |
| `web/src/components/dashboard/SentimentCard.tsx` | 情感分布卡片 |
| `web/src/components/dashboard/VolumeChart.tsx` | 内容处理量折线图 |
| `web/src/components/dashboard/CategoryChart.tsx` | 分类 Top10 Bar Chart |
| `web/src/components/dashboard/SourceChart.tsx` | 来源分布饼图 |
| `monitoring/prometheus.yml` | 新增 processor 抓取配置（可选，如需要） |

---

### Task 1: 新增 `/analytics` API 端点

**Files:**
- Modify: `api/main.py`
- Modify: `api/models.py`

- [ ] **Step 1: 添加 Pydantic 模型**

在 `api/models.py` 末尾添加：

```python
class SignalDistribution(BaseModel):
    high: int  # signal >= 0.8
    mid: int   # 0.5 <= signal < 0.8
    low: int   # signal < 0.5

class CategoryCount(BaseModel):
    category: str
    count: int

class SentimentCounts(BaseModel):
    positive: int
    neutral: int
    negative: int

class VolumeDataPoint(BaseModel):
    date: str  # YYYY-MM-DD
    count: int

class SourceCount(BaseModel):
    source: str
    count: int

class AnalyticsResponse(BaseModel):
    signal_distribution: SignalDistribution
    category_counts: list[CategoryCount]
    sentiment_counts: SentimentCounts
    volume_timeline: list[VolumeDataPoint]
    source_counts: list[SourceCount]
```

- [ ] **Step 2: 添加 SQL 查询函数到 main.py**

在 `api/main.py` 中添加（放在 `ensure_triples_column` 之后）：

```python
def _query_signal_distribution(days: int, session) -> SignalDistribution:
    rows = session.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE signal_strength >= 0.8) AS high,
                COUNT(*) FILTER (WHERE signal_strength >= 0.5 AND signal_strength < 0.8) AS mid,
                COUNT(*) FILTER (WHERE signal_strength < 0.5) AS low
            FROM processed_articles
            WHERE processed_at > NOW() - INTERVAL ':days days'
        """),
        {"days": days},
    ).fetchone()
    return SignalDistribution(high=rows.high or 0, mid=rows.mid or 0, low=rows.low or 0)


def _query_category_counts(days: int, session) -> list[CategoryCount]:
    rows = session.execute(
        text("""
            SELECT category, COUNT(*) as count
            FROM processed_articles,
                 jsonb_array_elements_text(categories)
            WHERE processed_at > NOW() - INTERVAL ':days days'
            GROUP BY category
            ORDER BY count DESC
            LIMIT 10
        """),
        {"days": days},
    ).fetchall()
    return [CategoryCount(category=r.category, count=r.count) for r in rows]


def _query_sentiment_counts(days: int, session) -> SentimentCounts:
    rows = session.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE sentiment = 'positive') AS positive,
                COUNT(*) FILTER (WHERE sentiment = 'neutral') AS neutral,
                COUNT(*) FILTER (WHERE sentiment = 'negative') AS negative
            FROM processed_articles
            WHERE processed_at > NOW() - INTERVAL ':days days'
        """),
        {"days": days},
    ).fetchone()
    return SentimentCounts(
        positive=rows.positive or 0,
        neutral=rows.neutral or 0,
        negative=rows.negative or 0,
    )


def _query_volume_timeline(days: int, session) -> list[VolumeDataPoint]:
    rows = session.execute(
        text("""
            SELECT DATE(processed_at) AS date, COUNT(*) AS count
            FROM processed_articles
            WHERE processed_at > NOW() - INTERVAL ':days days'
            GROUP BY DATE(processed_at)
            ORDER BY date ASC
        """),
        {"days": days},
    ).fetchall()
    return [VolumeDataPoint(date=str(r.date), count=r.count) for r in rows]


def _query_source_counts(days: int, session) -> list[SourceCount]:
    rows = session.execute(
        text("""
            SELECT (elem->>'name') AS source, COUNT(*) AS count
            FROM processed_articles,
                 jsonb_array_elements(sources) AS elem
            WHERE processed_at > NOW() - INTERVAL ':days days'
            GROUP BY source
            ORDER BY count DESC
            LIMIT 10
        """),
        {"days": days},
    ).fetchall()
    return [SourceCount(source=r.source or 'unknown', count=r.count) for r in rows]
```

- [ ] **Step 3: 添加 `@app.get("/analytics")` 端点**

在 `api/main.py` 中添加端点（放在 `/graph/search` 之后）：

```python
@app.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(days: int = Query(7, ge=1, le=90)):
    """
    返回仪表板聚合数据:
    - signal_distribution: 高/中/低 signal 计数
    - category_counts: Top 10 分类
    - sentiment_counts: positive/neutral/negative 计数
    - volume_timeline: 近 N 天每日处理量
    - source_counts: Top 10 来源
    """
    session = Session()
    try:
        signal_dist = _query_signal_distribution(days, session)
        category_counts = _query_category_counts(days, session)
        sentiment_counts = _query_sentiment_counts(days, session)
        volume_timeline = _query_volume_timeline(days, session)
        source_counts = _query_source_counts(days, session)

        return AnalyticsResponse(
            signal_distribution=signal_dist,
            category_counts=category_counts,
            sentiment_counts=sentiment_counts,
            volume_timeline=volume_timeline,
            source_counts=source_counts,
        )
    finally:
        session.close()
```

- [ ] **Step 4: 测试 API 端点**

Run: `curl -s "http://localhost:8000/analytics?days=7" | python3 -m json.tool`
Expected: 返回 JSON 含 `signal_distribution`, `category_counts`, `sentiment_counts`, `volume_timeline`, `source_counts`

- [ ] **Step 5: Commit**

```bash
git add api/main.py api/models.py
git commit -m "feat(api): add /analytics endpoint for dashboard metrics"
```

---

### Task 2: 前端 API 客户端扩展

**Files:**
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: 添加 fetchAnalytics 类型和函数**

在 `api.ts` 末尾添加：

```typescript
export interface SignalDistribution {
  high: number;
  mid: number;
  low: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface SentimentCounts {
  positive: number;
  neutral: number;
  negative: number;
}

export interface VolumeDataPoint {
  date: string;
  count: number;
}

export interface SourceCount {
  source: string;
  count: number;
}

export interface AnalyticsResponse {
  signal_distribution: SignalDistribution;
  category_counts: CategoryCount[];
  sentiment_counts: SentimentCounts;
  volume_timeline: VolumeDataPoint[];
  source_counts: SourceCount[];
}

export async function fetchAnalytics(days: number = 7): Promise<AnalyticsResponse> {
  const res = await fetch(`${API_BASE}/analytics?days=${days}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat(web): add fetchAnalytics() and AnalyticsResponse types"
```

---

### Task 3: 安装 Recharts 图表库

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: 安装 recharts**

Run: `cd /home/jinru/workon/broad_space/web && npm install recharts 2>&1 | tail -5`
Expected: 安装成功

- [ ] **Step 2: 验证 build**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "feat(web): add recharts for dashboard charts"
```

---

### Task 4: Dashboard 页面主组件

**Files:**
- Create: `web/src/app/dashboard/page.tsx`
- Create: `web/src/components/dashboard/SignalCard.tsx`
- Create: `web/src/components/dashboard/SentimentCard.tsx`
- Create: `web/src/components/dashboard/VolumeChart.tsx`
- Create: `web/src/components/dashboard/CategoryChart.tsx`
- Create: `web/src/components/dashboard/SourceChart.tsx`

- [ ] **Step 1: 创建 SignalCard 组件**

`web/src/components/dashboard/SignalCard.tsx`:

```typescript
"use client";
import { SignalDistribution } from "@/lib/api";

export default function SignalCard({ data }: { data: SignalDistribution }) {
  const total = data.high + data.mid + data.low;
  const highPct = total > 0 ? ((data.high / total) * 100).toFixed(1) : "0";
  const midPct = total > 0 ? ((data.mid / total) * 100).toFixed(1) : "0";
  const lowPct = total > 0 ? ((data.low / total) * 100).toFixed(1) : "0";

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-sm mb-3">Signal 分布</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><span className="text-red-500">🔴</span> 高 (≥0.8)</span>
          <span className="font-mono">{data.high} <span className="text-gray-400 text-xs">({highPct}%)</span></span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><span className="text-yellow-500">🟡</span> 中 (0.5-0.8)</span>
          <span className="font-mono">{data.mid} <span className="text-gray-400 text-xs">({midPct}%)</span></span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><span className="text-blue-500">🔵</span> 低 (&lt;0.5)</span>
          <span className="font-mono">{data.low} <span className="text-gray-400 text-xs">({lowPct}%)</span></span>
        </div>
      </div>
      <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden flex">
        <div className="bg-red-500 h-full" style={{ width: `${highPct}%` }} />
        <div className="bg-yellow-500 h-full" style={{ width: `${midPct}%` }} />
        <div className="bg-blue-500 h-full" style={{ width: `${lowPct}%` }} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 SentimentCard 组件**

`web/src/components/dashboard/SentimentCard.tsx`:

```typescript
"use client";
import { SentimentCounts } from "@/lib/api";

export default function SentimentCard({ data }: { data: SentimentCounts }) {
  const total = data.positive + data.neutral + data.negative;

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-sm mb-3">情感分布</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span>😊 Positive</span>
          <span className="font-mono">{data.positive}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>😐 Neutral</span>
          <span className="font-mono">{data.neutral}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>😔 Negative</span>
          <span className="font-mono">{data.negative}</span>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3 flex gap-1 h-2 rounded-full overflow-hidden">
          <div className="bg-green-500 h-full" style={{ width: `${(data.positive/total*100).toFixed(1)}%` }} />
          <div className="bg-gray-400 h-full" style={{ width: `${(data.neutral/total*100).toFixed(1)}%` }} />
          <div className="bg-red-400 h-full" style={{ width: `${(data.negative/total*100).toFixed(1)}%` }} />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 创建 VolumeChart 组件**

`web/src/components/dashboard/VolumeChart.tsx`:

```typescript
"use client";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { VolumeDataPoint } from "@/lib/api";

export default function VolumeChart({ data }: { data: VolumeDataPoint[] }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-sm mb-3">内容处理量趋势（近7天）</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 CategoryChart 组件**

`web/src/components/dashboard/CategoryChart.tsx`:

```typescript
"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CategoryCount } from "@/lib/api";

export default function CategoryChart({ data }: { data: CategoryCount[] }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-sm mb-3">分类统计 Top 10</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis type="number" tick={{ fontSize: 11 }} />
            <YAxis dataKey="category" type="category" tick={{ fontSize: 10 }} width={100} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建 SourceChart 组件**

`web/src/components/dashboard/SourceChart.tsx`:

```typescript
"use client";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";
import { SourceCount } from "@/lib/api";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#6b7280", "#84cc16", "#f97316"];

export default function SourceChart({ data }: { data: SourceCount[] }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-sm mb-3">来源分布</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={40}
              outerRadius={70}
              paddingAngle={2}
              dataKey="count"
            >
              {data.map((_, index) => (
                <Cell key={index} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        {data.map((item, i) => (
          <span key={item.source} className="text-xs flex items-center gap-1">
            <span className="w-2 h-2 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
            {item.source}
          </span>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 创建 Dashboard 页面**

`web/src/app/dashboard/page.tsx`:

```typescript
"use client";
import { useState, useEffect } from "react";
import { fetchAnalytics, AnalyticsResponse } from "@/lib/api";
import SignalCard from "@/components/dashboard/SignalCard";
import SentimentCard from "@/components/dashboard/SentimentCard";
import VolumeChart from "@/components/dashboard/VolumeChart";
import CategoryChart from "@/components/dashboard/CategoryChart";
import SourceChart from "@/components/dashboard/SourceChart";

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics(7)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4 h-40 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          Error: {error}
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SignalCard data={data.signal_distribution} />
        <SentimentCard data={data.sentiment_counts} />
      </div>

      <div className="mb-4">
        <VolumeChart data={data.volume_timeline} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CategoryChart data={data.category_counts} />
        <SourceChart data={data.source_counts} />
      </div>
    </main>
  );
}
```

- [ ] **Step 7: 验证 TypeScript 编译**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit`
Expected: 无错误

- [ ] **Step 8: Commit**

```bash
git add web/src/app/dashboard/page.tsx web/src/components/dashboard/
git commit -m "feat(web): add analytics dashboard page with recharts"
```

---

### Task 5: 添加 Dashboard 导航链接

**Files:**
- Modify: `web/src/components/NavBar.tsx`

- [ ] **Step 1: 更新 NavBar 添加 Dashboard 链接**

在 NavBar 中添加 Dashboard 链接：

```tsx
export default function NavBar({ active }: { active: "feed" | "graph" | "dashboard" }) {
  return (
    <nav className="flex gap-4 p-4 border-b">
      <Link href="/" className={active === "feed" ? "font-bold" : ""}>Feed</Link>
      <Link href="/graph" className={active === "graph" ? "font-bold" : ""}>Knowledge Graph</Link>
      <Link href="/dashboard" className={active === "dashboard" ? "font-bold" : ""}>Dashboard</Link>
    </nav>
  );
}
```

更新 `layout.tsx` 传入正确的 active prop：

```tsx
// 从 usePathname() 判断
const pathname = usePathname();
const active = pathname === "/" ? "feed" : pathname === "/graph" ? "graph" : "dashboard";
```

- [ ] **Step 2: Commit**

```bash
git add web/src/components/NavBar.tsx web/src/app/layout.tsx
git commit -m "feat(web): add Dashboard link to NavBar"
```

---

### Task 6: 端到端验证

- [ ] **Step 1: 启动服务并运行 Playwright 测试**

确保 API 运行：`curl -s http://localhost:8000/health` → 200

确保 Next.js dev server 运行：`curl -s http://localhost:3000` → HTML

创建测试文件 `web/e2e-dashboard.spec.js`：

```javascript
const { test, expect } = require('@playwright/test');

const BASE_URL = 'http://localhost:3000';

test('Dashboard page loads without console errors', async ({ page }) => {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto(`${BASE_URL}/dashboard`);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(3000);

  const heading = await page.locator('h1').first().textContent();
  expect(heading).toContain('Analytics');

  const nav = await page.locator('nav a[href="/dashboard"]').count();
  expect(nav).toBeGreaterThan(0);

  console.log('Console errors:', errors.length === 0 ? 'NONE' : errors);
  expect(errors).toHaveLength(0);
});
```

Run: `npx playwright test e2e-dashboard.spec.js --browser=chromium --reporter=line`

- [ ] **Step 2: 清理并提交**

```bash
rm -rf test-results/ web/e2e-dashboard.spec.js
git commit -m "test(web): verify dashboard page with Playwright"
```

---

## Self-Review

**1. Spec coverage:**
- [x] `/analytics` API 端点返回 signal_distribution, category_counts, sentiment_counts, volume_timeline, source_counts
- [x] Dashboard 页面加载 skeleton/loading
- [x] Signal 分布、情感分布、分类统计、来源分布正确渲染
- [x] 内容处理量折线图显示近 7 天趋势
- [x] Dashboard 导航链接
- [x] Playwright 验证

**2. Placeholder scan:** 无 TBD/TODO 占位符。

**3. Type consistency:** `fetchAnalytics` 返回 `AnalyticsResponse` 类型，与各子组件类型完全对应。