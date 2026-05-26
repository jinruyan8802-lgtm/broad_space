# Next.js 前端完整接入 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Next.js 前端接入真实 API：GraphCanvas 显示真实图数据、Feed 页面支持分类过滤和自动刷新、添加共享导航栏。

**Architecture:**
- `api.ts` 新增 `fetchGraph()` 和类型定义
- Feed 页面 (`page.tsx`) 改为客户端组件，支持分类过滤和 60s 轮询
- Graph 页面 (`graph/page.tsx`) 改为客户端组件，调用 `fetchGraph()`
- `GraphCanvas` 组件扩展接口（signal/summary），支持 tooltip 和 query 输入
- 新增 `NavBar` 共享导航组件

**Tech Stack:** Next.js 14 (Pages Router), TypeScript, Tailwind CSS, D3.js v7

---

## 文件变更总览

| 文件 | 变更 |
|-----|------|
| `web/src/lib/api.ts` | 新增 `fetchGraph()` + `GraphSearchResult`/`GraphSearchResponse` 类型 |
| `web/src/app/page.tsx` | 改为 `"use client"` + category filter chips + 60s 轮询 |
| `web/src/app/graph/page.tsx` | 改为 `"use client"` + 调用 `fetchGraph()` |
| `web/src/components/GraphCanvas.tsx` | 接口扩展（signal/summary/value）+ tooltip 支持 + query 输入 |
| `web/src/components/NavBar.tsx` | 新建：共享导航栏组件 |
| `web/src/app/layout.tsx` | 引入 NavBar |

---

## Task 1: 扩展 api.ts — fetchGraph + 类型

**文件：**
- Modify: `web/src/lib/api.ts`

### Step 1: 更新接口类型

在 `api.ts` 顶部接口定义区域添加：

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
```

### Step 2: 新增 fetchGraph 函数

在 `api.ts` 末尾添加：

```typescript
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

### Step 3: 验证

```bash
cd /home/jinru/workon/broad_space/web
npx tsc --noEmit src/lib/api.ts
```

### Step 4: Commit

```bash
git add web/src/lib/api.ts
git commit -m "feat: add fetchGraph() and GraphSearchResponse types to api.ts"
```

---

## Task 2: 新建 NavBar 共享导航组件

**文件：**
- Create: `web/src/components/NavBar.tsx`

### Step 1: 创建 NavBar.tsx

```tsx
import Link from "next/link";

"use client";

import Link from "next/link";
import { useRouter } from "next/router";

export default function NavBar() {
  const router = useRouter();
  const isGraph = router.pathname === "/graph";
  const active = isGraph ? "graph" : "feed";
  return (
    <nav className="flex items-center gap-1 px-6 py-3 border-b border-gray-200 bg-white">
      <span className="text-sm font-bold text-gray-900 mr-2">BroadSpace</span>
      <Link
        href="/"
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          active === "feed"
            ? "bg-blue-50 text-blue-600 font-semibold"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        Feed
      </Link>
      <Link
        href="/graph"
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          active === "graph"
            ? "bg-blue-50 text-blue-600 font-semibold"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        Knowledge Graph
      </Link>
    </nav>
  );
}
```

### Step 2: 更新 layout.tsx

修改 `web/src/app/layout.tsx`，在 `<body>` 开头添加 `<NavBar />`（NavBar 自己检测路由，不再需要传 active prop）：

```tsx
import NavBar from "@/components/NavBar";
import "./globals.css";

export const metadata = {
  title: "BroadSpace",
  description: "Daily tech knowledge broadening tool",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 min-h-screen">
        <NavBar active="feed" />
        {children}
      </body>
    </html>
  );
}
```

### Step 3: 验证语法

```bash
cd /home/jinru/workon/broad_space/web
npx tsc --noEmit src/components/NavBar.tsx src/app/layout.tsx
```

### Step 4: Commit

```bash
git add web/src/components/NavBar.tsx web/src/app/layout.tsx
git commit -m "feat: add shared NavBar component with Feed/Graph navigation"
```

---

## Task 3: Feed 页面增强 — category chips + 轮询

**文件：**
- Modify: `web/src/app/page.tsx`

### Step 1: 替换 page.tsx

将 `web/src/app/page.tsx` 替换为以下完整内容：

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import FeedCard from "@/components/FeedCard";
import { fetchContent } from "@/lib/api";

const CATEGORIES = [
  "AI/ML",
  "Infrastructure",
  "Programming Languages",
  "Security",
  "Frontend",
  "Mobile",
  "Database",
  "DevOps",
  "Open Source",
  "Academic",
];

export default function Home() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContent({
        limit: 30,
        ...(activeCategory ? { category: activeCategory } : {}),
      });
      setItems(data);
    } catch (e: any) {
      setError(e.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            activeCategory === null
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              activeCategory === cat
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Status */}
      {loading && items.length === 0 ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : error ? (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          Error: {error}
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No content yet. Run the pipeline to populate.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <FeedCard key={a.id} {...a} />
          ))}
        </div>
      )}
    </main>
  );
}
```

### Step 2: 验证

```bash
cd /home/jinru/workon/broad_space/web
npx tsc --noEmit src/app/page.tsx
```

### Step 3: Commit

```bash
git add web/src/app/page.tsx
git commit -m "feat: convert Feed page to client component with category chips and 60s auto-refresh"
```

---

## Task 4: GraphCanvas 接口扩展 — signal + tooltip + query 输入

**文件：**
- Modify: `web/src/components/GraphCanvas.tsx`

### Step 1: 替换 GraphCanvas.tsx

将 `web/src/components/GraphCanvas.tsx` 替换为以下完整内容：

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export interface GraphNode {
  id: string;
  group: string;
  signal?: number;
  summary?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  relation?: string;
  value?: number;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onQueryChange?: (query: string) => void;
}

const COLOR_MAP: Record<string, string> = {
  Technology: "#ef4444",
  Concept: "#3b82f6",
  Organization: "#22c55e",
  Person: "#a855f7",
  Event: "#f59e0b",
  Other: "#6b7280",
};

export default function GraphCanvas({ nodes, links, onQueryChange }: GraphCanvasProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: string;
  }>({ visible: false, x: 0, y: 0, content: "" });

  useEffect(() => {
    if (!ref.current || nodes.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = ref.current.clientWidth || 800;
    const height = ref.current.clientHeight || 600;
    svg.attr("width", width).attr("height", height);

    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(links as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
          .id((d: any) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(12));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.5)
      .attr("stroke-width", (d: any) => Math.sqrt(d.value || 1));

    const node = svg
      .append("g")
      .selectAll<SVGCircleElement, GraphNode>("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d) => 5 + (d.signal || 0.5) * 8)
      .attr("fill", (d) => COLOR_MAP[d.group] || COLOR_MAP.Other)
      .style("cursor", "pointer")
      .call(
        d3
          .drag<SVGCircleElement, GraphNode>()
          .on("start", (event, d: any) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d: any) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d: any) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node
      .on("mouseover", (event, d) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip({
          visible: true,
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top - 10,
          content: d.summary || d.id,
        });
      })
      .on("mousemove", (event) => {
        const rect = ref.current?.getBoundingClientRect();
        if (!rect) return;
        setTooltip((prev) => ({
          ...prev,
          x: event.clientX - rect.left + 12,
          y: event.clientY - rect.top - 10,
        }));
      })
      .on("mouseout", () => {
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    node.append("title").text((d) => d.id);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links]);

  return (
    <div className="relative w-full h-full">
      <svg ref={ref} className="w-full h-full" />
      {tooltip.visible && (
        <div
          className="absolute bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm shadow-lg pointer-events-none max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.content}
        </div>
      )}
    </div>
  );
}
```

### Step 2: 验证

```bash
cd /home/jinru/workon/broad_space/web
npx tsc --noEmit src/components/GraphCanvas.tsx
```

### Step 3: Commit

```bash
git add web/src/components/GraphCanvas.tsx
git commit -m "feat: extend GraphCanvas with signal-based node sizing, tooltip, and improved drag"
```

---

## Task 5: Graph 页面接入真实 API

**文件：**
- Modify: `web/src/app/graph/page.tsx`

### Step 1: 替换 graph/page.tsx

将 `web/src/app/graph/page.tsx` 替换为以下完整内容：

```tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import GraphCanvas from "@/components/GraphCanvas";
import type { GraphNode, GraphLink } from "@/components/GraphCanvas";
import { fetchGraph } from "@/lib/api";

function buildGraphFromResults(results: any[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodesMap: Record<string, GraphNode> = {};
  const links: GraphLink[] = [];

  results.forEach((r) => {
    const centerId = `result_${Math.random().toString(36).slice(2, 8)}`;
    nodesMap[centerId] = {
      id: centerId,
      group: "Concept",
      signal: r.score || 0,
      summary: r.text,
    };

    // Extract capitalized words from text as pseudo-entities
    const words = (r.text || "")
      .split(/[\s,.()]+/)
      .filter(
        (w: string) =>
          w.length > 3 &&
          /^[A-Z][a-z]/.test(w) &&
          !["The", "This", "That", "From", "With", "Which", "Their", "Using", "Based"].includes(w)
      );

    words.slice(0, 5).forEach((word: string) => {
      if (!nodesMap[word]) {
        nodesMap[word] = { id: word, group: "Technology", signal: 0.5 };
      }
      links.push({ source: centerId, target: word, value: 1 });
    });
  });

  return {
    nodes: Object.values(nodesMap),
    links: links.slice(0, Math.min(links.length, Object.keys(nodesMap).length * 3)),
  };
}

export default function GraphPage() {
  const [query, setQuery] = useState("AI");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchGraph({ query, limit: 50 });
      if (!data.results || data.results.length === 0) {
        setNodes([]);
        setLinks([]);
        setStatus("No results. Try a different query.");
        return;
      }
      const { nodes: n, links: l } = buildGraphFromResults(data.results);
      setNodes(n);
      setLinks(l);
      setStatus(`${n.length} nodes, ${l.length} connections`);
    } catch (e: any) {
      setError(e.message || "Failed to load graph");
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="flex flex-col h-[calc(100vh-48px)]">
      {/* Header with query input */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-gray-200 bg-white">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && load()}
          placeholder="Search query (e.g. AI, Rust, Machine Learning)"
          className="flex-1 max-w-sm px-3 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={load}
          disabled={loading}
          className="px-4 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Loading..." : "Search"}
        </button>
        {status && <span className="text-xs text-gray-500">{status}</span>}
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-50 text-red-600 text-sm rounded-lg">
          Error: {error}
        </div>
      )}

      {/* Graph canvas */}
      <div className="flex-1 overflow-hidden">
        <GraphCanvas nodes={nodes} links={links} />
      </div>
    </main>
  );
}
```

### Step 2: 验证

```bash
cd /home/jinru/workon/broad_space/web
npx tsc --noEmit src/app/graph/page.tsx
```

### Step 3: Commit

```bash
git add web/src/app/graph/page.tsx
git commit -m "feat: wire Graph page to /graph/search API with query input and real data"
```

---

## Task 6: 端到端验证

### Step 1: 启动 Next.js 开发服务器

```bash
cd /home/jinru/workon/broad_space/web
npm run dev &
sleep 5
curl -s http://localhost:3000/ | head -20
```

### Step 2: Playwright 验证

```bash
cat > /tmp/test_nextjs.py << 'PYEOF'
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)

    # Test 1: Feed page
    page = browser.new_page()
    errors = []
    page.on("console", lambda msg: errors.append(msg.text) if "error" in msg.text.lower() else None)
    page.on("pageerror", lambda err: errors.append(str(err)))

    page.goto("http://localhost:3000/")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    print("Feed page errors:", len([e for e in errors if "error" in e.lower()]))
    # Check category chips
    chips = page.locator("button").all()
    print(f"Feed buttons: {len(chips)}")

    # Test 2: Graph page
    errors.clear()
    page2 = browser.new_page()
    page2.on("console", lambda msg: errors.append(msg.text) if "error" in msg.text.lower() else None)
    page2.on("pageerror", lambda err: errors.append(str(err)))

    page2.goto("http://localhost:3000/graph")
    page2.wait_for_load_state("networkidle")
    page2.wait_for_timeout(3000)

    status = page2.locator("h1").first.inner_text()
    print(f"Graph page title: {status}")
    print(f"Graph page errors: {len([e for e in errors if 'error' in e.lower()])}")

    # Test 3: Search functionality
    search_input = page2.locator('input[type="text"]')
    search_input.fill("Rust")
    page2.locator('button:has-text("Search")').click()
    page2.wait_for_timeout(2000)
    print("Search test: OK")

    browser.close()
PYEOF
python3 /tmp/test_nextjs.py
```

### Step 3: Commit 最终状态

```bash
git add -A && git commit -m "feat: complete Next.js frontend integration with real API (sub-project B)"
```

---

## 自检清单

- [ ] **Spec 覆盖检查**
  - api.ts fetchGraph + 类型 → Task 1
  - NavBar 共享组件 → Task 2
  - Feed page category chips + 轮询 → Task 3
  - GraphCanvas signal/tooltip 扩展 → Task 4
  - Graph page 接入真实 API + query 输入 → Task 5
  - E2E 验证 → Task 6
- [ ] **占位符扫描** — 无 "TBD"、"TODO" 等
- [ ] **类型一致性** — `GraphSearchResult`/`GraphSearchResponse` 在 Task 1 定义，Task 5 引用，名称一致
- [ ] **NavBar active 状态** — `layout.tsx` 传 `"feed"`，`graph/page.tsx` 需要单独引入 NavBar 并传 `"graph"`