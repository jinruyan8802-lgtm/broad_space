# Feed 排序与分页实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 feed 页面添加排序切换（信号强度/发布时间，支持升降序）和传统页码翻页导航。

**Architecture:** 后端 API 新增 `sort_by`、`sort_order`、`page`、`page_size` 查询参数，返回分页包装格式；前端新增排序下拉选择器和页码导航组件。

**Tech Stack:** Python/FastAPI (backend), TypeScript/Next.js/Tailwind CSS (frontend)

---

## 文件结构

| 文件 | 操作 | 职责 |
|------|------|------|
| `api/models.py` | 修改 | 新增 `PaginatedContentResponse` 模型 |
| `api/main.py` | 修改 | `/content` 端点增加排序和分页逻辑 |
| `api/tests/test_endpoints.py` | 修改 | 新增排序和分页测试用例 |
| `web/src/lib/api.ts` | 修改 | `fetchContent` 扩展参数和返回类型 |
| `web/src/components/SortSelect.tsx` | 新建 | 排序下拉选择器组件 |
| `web/src/components/Pagination.tsx` | 新建 | 页码导航组件 |
| `web/src/app/page.tsx` | 修改 | 集成排序和分页功能 |

---

### Task 1: Backend - 新增 PaginatedContentResponse 模型

**Files:**
- Modify: `api/models.py`

- [ ] **Step 1: 在 models.py 末尾添加 PaginatedContentResponse**

在 `DashboardStatsResponse` 类之后添加：

```python
class PaginatedContentResponse(BaseModel):
    items: list[ContentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int
```

- [ ] **Step 2: 验证模型可导入**

Run: `cd /home/jinru/workon/broad_space && python -c "from api.models import PaginatedContentResponse; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add api/models.py
git commit -m "feat(api): add PaginatedContentResponse model"
```

---

### Task 2: Backend - /content 端点增加排序和分页

**Files:**
- Modify: `api/main.py:115-198`

- [ ] **Step 1: 修改 list_content 函数签名**

将 `api/main.py` 第 115-121 行：

```python
@app.get("/content", response_model=list[ContentResponse])
def list_content(
    category: str | None = Query(None, description="Filter by category"),
    min_signal: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
```

替换为：

```python
@app.get("/content")
def list_content(
    category: str | None = Query(None, description="Filter by category"),
    min_signal: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("signal", description="Sort field: signal or time"),
    sort_order: str = Query("desc", description="Sort direction: asc or desc"),
    page: int | None = Query(None, ge=1, description="Page number (1-based), enables pagination mode"),
    page_size: int = Query(30, ge=1, le=100, description="Items per page"),
):
```

- [ ] **Step 2: 在函数体开头添加参数验证和分页模式判断**

在 `session = Session()` 之前添加：

```python
    if sort_by not in ("signal", "time"):
        sort_by = "signal"
    if sort_order not in ("asc", "desc"):
        sort_order = "desc"

    use_pagination = page is not None
    if use_pagination:
        effective_limit = page_size
        effective_offset = (page - 1) * page_size
    else:
        effective_limit = limit
        effective_offset = offset
```

- [ ] **Step 3: 替换排序逻辑**

将第 143 行：

```python
        query_parts.append("ORDER BY signal_strength DESC, processed_at DESC")
```

替换为：

```python
        if sort_by == "time":
            query_parts.append(f"ORDER BY published_at {sort_order.upper()} NULLS LAST")
        else:
            query_parts.append(f"ORDER BY signal_strength {sort_order.upper()}, processed_at DESC")
```

- [ ] **Step 4: 替换 LIMIT/OFFSET 使用 effective 值**

将第 144 行：

```python
        query_parts.append("LIMIT :limit OFFSET :offset")
```

替换为：

```python
        query_parts.append("LIMIT :limit OFFSET :offset")
```

同时将 params 中的 `limit` 和 `offset` 改为使用 effective 值：

```python
        params: dict = {
            "min_signal": min_signal,
            "limit": effective_limit,
            "offset": effective_offset,
        }
```

- [ ] **Step 5: 重构查询构建，添加 COUNT 查询**

将整个函数体从 `session = Session()` 到 `return results` 替换为：

```python
    session = Session()
    try:
        # Build WHERE clause
        where_parts = [
            "FROM processed_articles WHERE signal_strength >= :min_signal"
        ]
        params: dict = {
            "min_signal": min_signal,
            "limit": effective_limit,
            "offset": effective_offset,
        }

        if category:
            where_parts.append("AND to_jsonb(categories) @> to_jsonb(:category_json)")
            params["category_json"] = [category]

        where_str = " ".join(where_parts)

        # Count query (pagination mode only)
        if use_pagination:
            count_result = session.execute(
                text(f"SELECT COUNT(*) AS total {where_str}"),
                params,
            )
            total = count_result.fetchone().total or 0
            total_pages = max(1, (total + page_size - 1) // page_size)

        # Sort clause
        if sort_by == "time":
            order_clause = f"ORDER BY published_at {sort_order.upper()} NULLS LAST"
        else:
            order_clause = f"ORDER BY signal_strength {sort_order.upper()}, processed_at DESC"

        # Data query
        data_query_str = f"""
            SELECT id, title, url, summary, categories, key_points,
                   signal_strength, sentiment, sources, processed_at, published_at, triples,
                   language, title_zh, summary_zh, key_points_zh
            {where_str}
            {order_clause}
            LIMIT :limit OFFSET :offset
        """
        query = session.execute(text(data_query_str), params)
```

- [ ] **Step 6: 修改返回值**

将最后的 `return results` 改为：

```python
        if use_pagination:
            return PaginatedContentResponse(
                items=results,
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            )
        return results
```

- [ ] **Step 7: 在文件顶部添加 PaginatedContentResponse 导入**

在 `api/main.py` 的 import 区域，将：

```python
from models import (
    ContentResponse, TripleItem, ScoreBreakdown,
    ...
)
```

添加 `PaginatedContentResponse`：

```python
from models import (
    ContentResponse, PaginatedContentResponse, TripleItem, ScoreBreakdown,
    ...
)
```

- [ ] **Step 8: 验证 API 启动**

Run: `cd /home/jinru/workon/broad_space && python -c "from api.main import app; print('OK')"`
Expected: `OK`

- [ ] **Step 9: Commit**

```bash
git add api/main.py
git commit -m "feat(api): add sort_by, sort_order, page, page_size to /content endpoint"
```

---

### Task 3: Backend - 更新测试用例

**Files:**
- Modify: `api/tests/test_endpoints.py`

- [ ] **Step 1: 在 TestContentEndpoint 类末尾添加排序和分页测试**

在 `test_content_with_signal_filter` 方法之后添加：

```python
    def test_content_sort_by_time(self, client, mock_session):
        mock_session.execute.return_value = []
        resp = client.get("/content?sort_by=time&sort_order=desc")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)

    def test_content_sort_by_signal_asc(self, client, mock_session):
        mock_session.execute.return_value = []
        resp = client.get("/content?sort_by=signal&sort_order=asc")
        assert resp.status_code == 200

    def test_content_pagination_mode(self, client, mock_session):
        # Mock count query result
        count_row = MagicMock()
        count_row.total = 0
        mock_count_result = MagicMock()
        mock_count_result.fetchone.return_value = count_row

        # Mock data query result (empty list, iterable)
        mock_data_result = []

        # First execute() call = count, second = data
        mock_session.execute.side_effect = [mock_count_result, mock_data_result]

        resp = client.get("/content?page=1&page_size=10")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] == 0
        assert data["page"] == 1
        assert data["page_size"] == 10
        assert data["total_pages"] == 1

    def test_content_backward_compat_no_page(self, client, mock_session):
        """Without page param, returns array format (backward compatible)."""
        mock_session.execute.return_value = []
        resp = client.get("/content")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
```

- [ ] **Step 2: 运行测试**

Run: `cd /home/jinru/workon/broad_space && python -m pytest api/tests/test_endpoints.py -v`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add api/tests/test_endpoints.py
git commit -m "test(api): add sorting and pagination tests for /content"
```

---

### Task 4: Frontend - 更新 fetchContent API 客户端

**Files:**
- Modify: `web/src/lib/api.ts:1-62`

- [ ] **Step 1: 添加 PaginatedContentResponse 接口**

在 `ContentItem` 接口之后（第 27 行后）添加：

```typescript
export interface PaginatedContentResponse {
  items: ContentItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}
```

- [ ] **Step 2: 更新 fetchContent 函数**

将第 50-62 行的 `fetchContent` 函数替换为：

```typescript
export async function fetchContent(params?: {
  category?: string;
  min_signal?: number;
  limit?: number;
  sort_by?: "signal" | "time";
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}): Promise<PaginatedContentResponse> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.min_signal !== undefined) qs.set("min_signal", String(params.min_signal));
  if (params?.limit) qs.set("limit", String(params.limit));
  if (params?.sort_by) qs.set("sort_by", params.sort_by);
  if (params?.sort_order) qs.set("sort_order", params.sort_order);
  if (params?.page !== undefined) qs.set("page", String(params.page));
  if (params?.page_size) qs.set("page_size", String(params.page_size));
  const res = await fetch(`${API_BASE}/content?${qs}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
```

- [ ] **Step 3: 验证 TypeScript 编译**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit 2>&1 | head -20`
Expected: 编译报错是预期的（因为 page.tsx 还在用旧格式），在 Task 7 中修复

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/api.ts
git commit -m "feat(web): extend fetchContent with sort and pagination params"
```

---

### Task 5: Frontend - 创建 SortSelect 组件

**Files:**
- Create: `web/src/components/SortSelect.tsx`

- [ ] **Step 1: 创建 SortSelect.tsx**

```tsx
"use client";

interface SortOption {
  label: string;
  sortBy: "signal" | "time";
  sortOrder: "asc" | "desc";
}

const SORT_OPTIONS: SortOption[] = [
  { label: "信号强度（高→低）", sortBy: "signal", sortOrder: "desc" },
  { label: "信号强度（低→高）", sortBy: "signal", sortOrder: "asc" },
  { label: "发布时间（新→旧）", sortBy: "time", sortOrder: "desc" },
  { label: "发布时间（旧→新）", sortBy: "time", sortOrder: "asc" },
];

interface SortSelectProps {
  sortBy: "signal" | "time";
  sortOrder: "asc" | "desc";
  onChange: (sortBy: "signal" | "time", sortOrder: "asc" | "desc") => void;
  theme?: "dark" | "light";
}

export default function SortSelect({ sortBy, sortOrder, onChange, theme = "dark" }: SortSelectProps) {
  const isDark = theme === "dark";
  const currentIndex = SORT_OPTIONS.findIndex(
    (o) => o.sortBy === sortBy && o.sortOrder === sortOrder
  );

  return (
    <select
      value={currentIndex}
      onChange={(e) => {
        const opt = SORT_OPTIONS[Number(e.target.value)];
        onChange(opt.sortBy, opt.sortOrder);
      }}
      className={`text-sm px-3 py-1.5 rounded border cursor-pointer ${
        isDark
          ? "bg-[#1a1a2e] text-gray-300 border-gray-600"
          : "bg-white text-gray-700 border-gray-200"
      }`}
    >
      {SORT_OPTIONS.map((opt, i) => (
        <option key={i} value={i}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit 2>&1 | grep SortSelect || echo "No errors in SortSelect"`
Expected: `No errors in SortSelect`

- [ ] **Step 3: Commit**

```bash
git add web/src/components/SortSelect.tsx
git commit -m "feat(web): add SortSelect dropdown component"
```

---

### Task 6: Frontend - 创建 Pagination 组件

**Files:**
- Create: `web/src/components/Pagination.tsx`

- [ ] **Step 1: 创建 Pagination.tsx**

```tsx
"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  theme?: "dark" | "light";
}

export default function Pagination({ page, totalPages, onPageChange, theme = "dark" }: PaginationProps) {
  if (totalPages <= 1) return null;

  const isDark = theme === "dark";

  // Generate page numbers to display
  const getPageNumbers = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | "ellipsis")[] = [1];

    if (page > 3) {
      pages.push("ellipsis");
    }

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (page < totalPages - 2) {
      pages.push("ellipsis");
    }

    pages.push(totalPages);

    return pages;
  };

  const btnBase = `px-3 py-1.5 text-sm rounded border transition-colors`;
  const btnActive = isDark
    ? "bg-blue-600 text-white border-blue-600"
    : "bg-blue-600 text-white border-blue-600";
  const btnInactive = isDark
    ? "bg-[#1a1a2e] text-gray-300 border-gray-600 hover:border-blue-400"
    : "bg-white text-gray-700 border-gray-200 hover:border-blue-400";
  const btnDisabled = isDark
    ? "bg-[#1a1a2e] text-gray-600 border-gray-700 cursor-not-allowed"
    : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed";

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} ${page <= 1 ? btnDisabled : btnInactive}`}
      >
        ← 上一页
      </button>

      {getPageNumbers().map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} className={`px-2 text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`${btnBase} ${p === page ? btnActive : btnInactive}`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={`${btnBase} ${page >= totalPages ? btnDisabled : btnInactive}`}
      >
        下一页 →
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 验证 TypeScript 编译**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit 2>&1 | grep Pagination || echo "No errors in Pagination"`
Expected: `No errors in Pagination`

- [ ] **Step 3: Commit**

```bash
git add web/src/components/Pagination.tsx
git commit -m "feat(web): add Pagination component"
```

---

### Task 7: Frontend - 集成排序和分页到 feed 页面

**Files:**
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: 添加导入**

将第 7 行：

```typescript
import { fetchContent, fetchAnalytics, ContentItem, AnalyticsResponse } from "@/lib/api";
```

替换为：

```typescript
import { fetchContent, fetchAnalytics, ContentItem, AnalyticsResponse, PaginatedContentResponse } from "@/lib/api";
import SortSelect from "@/components/SortSelect";
import Pagination from "@/components/Pagination";
```

- [ ] **Step 2: 添加排序和分页状态**

在第 34 行 `const [searchQuery, setSearchQuery] = useState("");` 之后添加：

```typescript
  const [sortBy, setSortBy] = useState<"signal" | "time">("signal");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
```

- [ ] **Step 3: 更新 loadContent 函数**

将第 37-51 行的 `loadContent` 替换为：

```typescript
  const loadContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContent({
        page,
        page_size: 30,
        sort_by: sortBy,
        sort_order: sortOrder,
        ...(activeCategory ? { category: activeCategory } : {}),
      });
      setItems(data.items);
      setTotalPages(data.total_pages);
    } catch (e: any) {
      setError(e.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [activeCategory, sortBy, sortOrder, page]);
```

- [ ] **Step 4: 更新 useEffect 依赖**

`loadContent` 的依赖已经包含 `sortBy`、`sortOrder`、`page`，所以现有的 `useEffect(() => { loadContent(); ... }, [loadContent, loadAnalytics])` 会自动在这些值变化时重新执行。

- [ ] **Step 5: 在分类筛选栏后面添加排序下拉**

在第 173 行（分类筛选的 `</div>` 结束标签）之后，第 175 行（Score distribution bar）之前，添加排序选择器：

```tsx
            {/* Sort selector */}
            <div className="flex items-center gap-2 mb-4">
              <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>排序：</span>
              <SortSelect
                sortBy={sortBy}
                sortOrder={sortOrder}
                onChange={(newSortBy, newSortOrder) => {
                  setSortBy(newSortBy);
                  setSortOrder(newSortOrder);
                  setPage(1);
                }}
                theme={theme}
              />
            </div>
```

- [ ] **Step 6: 在 feed 列表后面添加分页导航**

在第 226 行（feed 列表 `</div>` 结束标签）之后添加：

```tsx
            {/* Pagination */}
            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              theme={theme}
            />
```

- [ ] **Step 7: 验证 TypeScript 编译**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit 2>&1 | head -20`
Expected: 无编译错误

- [ ] **Step 8: 启动开发服务器验证**

Run: `cd /home/jinru/workon/broad_space/web && npm run build 2>&1 | tail -10`
Expected: Build succeeds

- [ ] **Step 9: Commit**

```bash
git add web/src/app/page.tsx
git commit -m "feat(web): integrate sort dropdown and pagination into feed page"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: 启动后端 API**

Run: `cd /home/jinru/workon/broad_space && docker compose up -d api postgres`
Expected: Services start successfully

- [ ] **Step 2: 测试分页 API**

Run: `curl -s "http://localhost:8000/content?page=1&page_size=5" | python -m json.tool | head -20`
Expected: 返回 `{"items": [...], "total": ..., "page": 1, "page_size": 5, "total_pages": ...}`

- [ ] **Step 3: 测试排序 API**

Run: `curl -s "http://localhost:8000/content?page=1&page_size=5&sort_by=time&sort_order=desc" | python -m json.tool | head -20`
Expected: 返回分页格式，items 按 published_at 降序排列

- [ ] **Step 4: 测试向后兼容**

Run: `curl -s "http://localhost:8000/content?limit=5" | python -m json.tool | head -10`
Expected: 返回数组格式 `[{...}, ...]`（不含 page 参数时保持旧格式）

- [ ] **Step 5: 启动前端验证 UI**

Run: `cd /home/jinru/workon/broad_space/web && npm run dev`
在浏览器中打开 http://localhost:3000，验证：
- 排序下拉选择器显示在分类筛选下方
- 切换排序选项后列表重新加载
- 页码导航显示在列表底部
- 点击页码后内容更新
- 切换排序或分类时页码重置为 1

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: feed page sorting and pagination complete"
```
