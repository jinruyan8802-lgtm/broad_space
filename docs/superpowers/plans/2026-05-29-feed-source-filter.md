# Feed Source Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add data source checkboxes to the feed page so users can filter content by source (Hacker News, GitHub Trending, etc.), combined with existing category filter via AND logic.

**Architecture:** Add `source` query parameter to `GET /content` endpoint using PostgreSQL JSONB path filtering. New `SourceFilter` checkbox component on the frontend. Sources use OR logic between each other, AND with category.

**Tech Stack:** Python/FastAPI, PostgreSQL JSONB, Next.js/React/TypeScript, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `api/tests/test_endpoints.py` | Modify | Add source filter tests |
| `api/main.py` | Modify | Add `source` param and JSONB filter |
| `web/src/lib/api.ts` | Modify | Add `sources` param to `fetchContent` |
| `web/src/components/SourceFilter.tsx` | Create | Checkbox component for data sources |
| `web/src/app/page.tsx` | Modify | Integrate SourceFilter and state |

---

### Task 1: Backend — Add source filter to /content endpoint

**Files:**
- Modify: `api/tests/test_endpoints.py`
- Modify: `api/main.py:115-180`

- [ ] **Step 1: Write failing test for source filter**

Add to `api/tests/test_endpoints.py`, inside `TestContentEndpoint`:

```python
def test_content_with_source_filter(self, client, mock_session):
    mock_session.execute.return_value = []
    resp = client.get("/content?source=hackernews")
    assert resp.status_code == 200

def test_content_with_multiple_sources(self, client, mock_session):
    mock_session.execute.return_value = []
    resp = client.get("/content?source=hackernews,arxiv")
    assert resp.status_code == 200

def test_content_source_and_category_combined(self, client, mock_session):
    mock_session.execute.return_value = []
    resp = client.get("/content?source=hackernews&category=AI/ML")
    assert resp.status_code == 200

def test_content_source_pagination(self, client, mock_session):
    count_row = MagicMock()
    count_row.total = 0
    mock_count_result = MagicMock()
    mock_count_result.fetchone.return_value = count_row
    mock_data_result = []
    mock_session.execute.side_effect = [mock_count_result, mock_data_result]
    resp = client.get("/content?source=hackernews,arxiv&page=1&page_size=10")
    assert resp.status_code == 200
    data = resp.json()
    assert "items" in data
    assert data["total"] == 0
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /home/jinru/workon/broad_space/api && python -m pytest tests/test_endpoints.py::TestContentEndpoint::test_content_with_source_filter -v`
Expected: FAIL — `source` parameter not recognized

- [ ] **Step 3: Implement source filter in /content endpoint**

In `api/main.py`, modify the `list_content` function:

Add parameter after `category`:
```python
source: str | None = Query(None, description="Filter by source name(s), comma-separated"),
```

After the `category` filter block (around line 153), add:
```python
if source:
    source_names = [s.strip() for s in source.split(",") if s.strip()]
    if source_names:
        where_parts.append(
            "AND jsonb_path_exists(sources::jsonb, '$[*] ? (@.name in ($src_names))')"
        )
        params["src_names"] = source_names
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /home/jinru/workon/broad_space/api && python -m pytest tests/test_endpoints.py::TestContentEndpoint -v`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
cd /home/jinru/workon/broad_space
git add api/main.py api/tests/test_endpoints.py
git commit -m "feat(api): add source filter to /content endpoint"
```

---

### Task 2: Frontend API — Add sources param to fetchContent

**Files:**
- Modify: `web/src/lib/api.ts:58-78`

- [ ] **Step 1: Add sources to fetchContent params**

In `web/src/lib/api.ts`, update the `fetchContent` function:

Change the params type (line 58-66):
```typescript
export async function fetchContent(params?: {
  category?: string;
  sources?: string[];
  min_signal?: number;
  limit?: number;
  sort_by?: "signal" | "time";
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}): Promise<PaginatedContentResponse> {
```

Add after the `category` line (after line 68):
```typescript
  if (params?.sources?.length) qs.set("source", params.sources.join(","));
```

- [ ] **Step 2: Commit**

```bash
cd /home/jinru/workon/broad_space
git add web/src/lib/api.ts
git commit -m "feat(web): add sources param to fetchContent"
```

---

### Task 3: Frontend Component — Create SourceFilter

**Files:**
- Create: `web/src/components/SourceFilter.tsx`

- [ ] **Step 1: Create SourceFilter component**

Create `web/src/components/SourceFilter.tsx`:

```tsx
"use client";

const SOURCES = [
  { key: "hackernews", label: "Hacker News" },
  { key: "github_trending", label: "GitHub Trending" },
  { key: "arxiv", label: "ArXiv" },
  { key: "v2ex", label: "V2EX" },
  { key: "miniflux", label: "RSS/Miniflux" },
  { key: "juejin", label: "掘金" },
  { key: "lobsters", label: "Lobsters" },
  { key: "devto", label: "Dev.to" },
  { key: "kr36", label: "36Kr" },
];

interface SourceFilterProps {
  activeSources: string[];
  onChange: (sources: string[]) => void;
  theme?: "dark" | "light";
}

export default function SourceFilter({ activeSources, onChange, theme = "dark" }: SourceFilterProps) {
  const isDark = theme === "dark";

  const toggle = (key: string) => {
    if (activeSources.includes(key)) {
      onChange(activeSources.filter((s) => s !== key));
    } else {
      onChange([...activeSources, key]);
    }
  };

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {SOURCES.map((src) => (
        <label
          key={src.key}
          className={`flex items-center gap-1.5 text-sm cursor-pointer select-none ${
            isDark ? "text-gray-300" : "text-gray-700"
          }`}
        >
          <input
            type="checkbox"
            checked={activeSources.includes(src.key)}
            onChange={() => toggle(src.key)}
            className="accent-blue-600"
          />
          {src.label}
        </label>
      ))}
      {activeSources.length > 0 && (
        <button
          onClick={() => onChange([])}
          className={`text-xs px-2 py-0.5 rounded border ${
            isDark
              ? "text-gray-400 border-gray-600 hover:border-gray-400"
              : "text-gray-500 border-gray-300 hover:border-gray-500"
          }`}
        >
          清除
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
cd /home/jinru/workon/broad_space
git add web/src/components/SourceFilter.tsx
git commit -m "feat(web): add SourceFilter checkbox component"
```

---

### Task 4: Frontend Page — Integrate SourceFilter into feed page

**Files:**
- Modify: `web/src/app/page.tsx`

- [ ] **Step 1: Add import and state**

Add import after line 8:
```typescript
import SourceFilter from "@/components/SourceFilter";
```

Add state after `activeCategory` (after line 33):
```typescript
const [activeSources, setActiveSources] = useState<string[]>([]);
```

- [ ] **Step 2: Update loadContent to pass sources**

In `loadContent` (line 47-53), add sources to the fetchContent call:
```typescript
const data = await fetchContent({
  page,
  page_size: 30,
  sort_by: sortBy,
  sort_order: sortOrder,
  ...(activeCategory ? { category: activeCategory } : {}),
  ...(activeSources.length > 0 ? { sources: activeSources } : {}),
});
```

Add `activeSources` to the dependency array (line 61):
```typescript
}, [activeCategory, activeSources, sortBy, sortOrder, page]);
```

- [ ] **Step 3: Add SourceFilter to the UI**

After the category filter chips block (after line 183), add:
```tsx
{/* Source filter checkboxes */}
<div className={`${cardBg} border ${borderColor} rounded-lg px-4 py-3 mb-4`}>
  <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"} block mb-2`}>
    数据源筛选：
  </span>
  <SourceFilter
    activeSources={activeSources}
    onChange={(sources) => {
      setActiveSources(sources);
      setPage(1);
    }}
    theme={theme}
  />
</div>
```

- [ ] **Step 4: Verify build passes**

Run: `cd /home/jinru/workon/broad_space/web && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
cd /home/jinru/workon/broad_space
git add web/src/app/page.tsx
git commit -m "feat(web): integrate source filter into feed page"
```

---

### Task 5: Manual verification

- [ ] **Step 1: Start services and verify**

```bash
cd /home/jinru/workon/broad_space
docker compose up -d
cd web && npm run dev
```

- [ ] **Step 2: Test in browser**

Open http://localhost:3000 and verify:
1. Source checkboxes appear below category chips
2. Selecting a source filters content
3. Selecting multiple sources shows content from any of them (OR)
4. Combining source + category works (AND)
5. "清除" button clears source selection
6. Pagination resets when source changes
