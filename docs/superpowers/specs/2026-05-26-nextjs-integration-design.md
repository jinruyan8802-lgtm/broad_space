# PRD: Next.js 前端完整接入

**项目:** BroadSpace 子项目 B — Next.js 前端完整接入真实 API
**日期:** 2026/05/26
**状态:** 设计中

---

## 1. 背景与问题

当前 `feed-server.js` 是独立 Node.js 服务器，与 Next.js 前端并存。Next.js 前端存在以下问题：

| 问题 | 现状 |
|-----|------|
| `/graph` 页面 | 硬编码 mock 数据，未接入真实 `/graph/search` API |
| `api.ts` | 只有 `fetchContent`，缺少图搜索 API 调用 |
| Feed 页面 | 无分类过滤、无自动刷新、无翻页 |
| 导航 | `/graph` 和 `/` 导航分离，无统一布局 |
| CORS | API 已修复（`allow_origins=["*"]`），Next.js 可直接调用 |

最终目标：用户访问 `localhost:3000` 时使用 Next.js 前端（而非 feed-server.js），功能完整。

---

## 2. 目标

1. **GraphCanvas 接入真实图数据** — 将 `/graph` 页面从 mock 改为调用 `/graph/search` API
2. **扩展 api.ts** — 新增 `fetchGraph()` 函数，类型与 `GraphSearchResponse` 对齐
3. **Feed 页面增强** — 支持分类过滤（category chips）、自动刷新（60s）
4. **统一布局** — 添加共享导航栏（Feed / Knowledge Graph 切换）

---

## 3. API 扩展

### 3.1 `api.ts` — 新增 fetchGraph

```typescript
export interface GraphSearchResult {
  text: string;
  score: number;
  entities: string[];
  entity_names_zh: string[];
}

export interface GraphSearchResponse {
  query: string;
  results: GraphSearchResult[];
}

export async function fetchGraph(params: {
  query: string;
  limit?: number;
}): Promise<GraphSearchResponse> {
  const qs = new URLSearchParams({ query: params.query });
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${API_BASE}/graph/search?${qs}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

---

## 4. 页面改造

### 4.1 Feed 页面 (`src/app/page.tsx`)

**改动：**
- 客户端组件（添加 `"use client"`），支持交互状态
- Category filter chips（从 URL query 参数读取当前选中分类）
- 自动刷新：60s 轮询 `fetchContent`
- 分类 URL 同步：`?category=AI/ML` 可分享

**数据流：**
```
用户点击 category chip
  → 更新 URL searchParams
  → useEffect 触发 fetchContent(category=xxx)
  → Feed 重新渲染
```

### 4.2 Graph 页面 (`src/app/graph/page.tsx`)

**改动：**
- 客户端组件（添加 `"use client"`）
- 调用 `fetchGraph({ query: "AI", limit: 50 })`
- 数据传给 `GraphCanvas`

### 4.3 GraphCanvas (`src/components/GraphCanvas.tsx`)

**增强：**
- 支持 `signal` 属性（node 大小按 score 缩放）
- 支持 tooltip 显示 `entity_names_zh`
- 支持 query 输入框（改变搜索词）
- `nodes` 接口扩展 `signal?: number`，`links` 接口扩展 `value?: number`

```typescript
interface GraphNode {
  id: string;
  group: string;
  signal?: number;   // 新增
  summary?: string;  // 新增
}

interface GraphLink {
  source: string;
  target: string;
  relation?: string;
  value?: number;     // 新增
}
```

### 4.4 共享导航 (`src/components/NavBar.tsx`)

新增 `NavBar` 组件，替代各页面内的内联导航：
```tsx
export default function NavBar({ active }: { active: "feed" | "graph" }) {
  return (
    <nav className="flex gap-4 p-4 border-b">
      <Link href="/" className={active === "feed" ? "font-bold" : ""}>Feed</Link>
      <Link href="/graph" className={active === "graph" ? "font-bold" : ""}>Knowledge Graph</Link>
    </nav>
  );
}
```

---

## 5. 非目标（本次）

- 不替换 `feed-server.js`（子项目 B 完成后，Next.js 独立运行，feed-server.js 保留备用）
- 不添加用户认证
- 不实现邮件/WeCom（子项目 C/D）

---

## 6. 验收标准

- [ ] `GET /graph?query=AI` 返回的图数据正确渲染 D3 可视化
- [ ] Feed 页面点击 category chip 正确过滤内容
- [ ] Feed 页面每 60s 自动刷新
- [ ] 导航栏在 Feed 和 Graph 页面均正确显示高亮
- [ ] Playwright 验证两个页面均无 console error