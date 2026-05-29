# Feed Page Data Source Filter

**Date:** 2026-05-29
**Status:** Approved

## Overview

Add data source checkboxes to the feed page, allowing users to filter content by source (e.g., Hacker News, GitHub Trending, ArXiv). Works alongside the existing category filter with AND logic.

## Requirements

- Display all 9 data sources as checkboxes on the feed page
- Users can select zero, one, or multiple sources
- Multiple selected sources use OR logic (show content from any selected source)
- Data source filter combines with category filter using AND logic
- Selecting no sources = show all sources (default behavior)
- Filter changes reset pagination to page 1

## Data Sources

| Source Key        | Display Name    |
|-------------------|-----------------|
| hackernews        | Hacker News     |
| github_trending   | GitHub Trending |
| arxiv             | ArXiv           |
| v2ex              | V2EX            |
| miniflux          | RSS/Miniflux    |
| juejin            | 掘金            |
| lobsters          | Lobsters        |
| devto             | Dev.to          |
| kr36              | 36Kr            |

## Architecture

### Backend (`api/main.py`)

**New parameter** on `GET /content`:
- `source: str | None` — comma-separated source names (e.g., `source=hackernews,arxiv`)

**SQL filter logic:**
```sql
-- When sources provided, filter using JSONB path existence check
AND jsonb_path_exists(sources, '$[*] ? (@.name in ($src_names))')
-- Bind: src_names = ['hackernews', 'arxiv']
```

The `sources` column stores a JSONB array of `{name, url}` objects. `jsonb_path_exists` checks if any element in the array has a `name` matching one of the provided source names.

**Count query** must include the same source filter to return correct `total` for pagination.

### Frontend API (`web/src/lib/api.ts`)

Add `sources?: string[]` to `fetchContent` params. Serialize as comma-separated string:
```
GET /content?source=hackernews,arxiv&page=1&page_size=30
```

### Frontend Component (`web/src/components/SourceFilter.tsx`)

New stateless component:
- Props: `activeSources: string[]`, `onChange: (sources: string[]) => void`, `theme: "dark" | "light"`
- Renders a row of checkboxes, one per source
- "全部" toggle to clear all selections
- Visual style consistent with existing category chips area

### Frontend Page (`web/src/app/page.tsx`)

- New state: `activeSources: string[]` (default: `[]`)
- Pass to `fetchContent` call
- Pass to `SourceFilter` component
- Reset `page` to 1 when `activeSources` changes
- Add `activeSources` to `loadContent` dependency array

## Filter Interaction

| Category | Sources | Result |
|----------|---------|--------|
| null (all) | [] (all) | All content |
| "AI/ML" | [] | AI/ML content from all sources |
| null | ["hackernews"] | All categories from Hacker News |
| "AI/ML" | ["hackernews", "arxiv"] | AI/ML content from Hacker News OR ArXiv |

## Files to Modify

1. `api/main.py` — add `source` parameter and JSONB filter
2. `web/src/lib/api.ts` — add `sources` param to `fetchContent`
3. `web/src/components/SourceFilter.tsx` — new component
4. `web/src/app/page.tsx` — integrate SourceFilter and state
