# Feed 排序与分页设计

日期: 2026-05-29

## 目标

为 feed 页面添加：
1. 排序切换（信号强度 / 发布时间，支持升序/降序）
2. 传统页码翻页导航

## API 变更

### `GET /content`

新增查询参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `sort_by` | `signal` \| `time` | `signal` | 排序字段 |
| `sort_order` | `asc` \| `desc` | `desc` | 排序方向 |
| `page` | int (≥1) | `1` | 页码，从 1 开始 |
| `page_size` | int (1-100) | `30` | 每页条数 |

保留现有参数（向后兼容）：`category`、`min_signal`、`limit`、`offset`。

当 `page` 或 `page_size` 存在时，使用新的分页模式；否则回退到 `limit`/`offset` 行为。

### 排序逻辑

- `sort_by=signal` → `ORDER BY signal_strength {sort_order}, processed_at DESC`
- `sort_by=time` → `ORDER BY published_at {sort_order} NULLS LAST`

### 返回格式

从当前数组格式：

```json
[{ "id": "...", "title": "...", ... }]
```

改为分页包装格式：

```json
{
  "items": [{ "id": "...", "title": "...", ... }],
  "total": 156,
  "page": 2,
  "page_size": 30,
  "total_pages": 6
}
```

需要新增 Pydantic 响应模型 `PaginatedContentResponse`。

### 向后兼容

当请求中不含 `page` 和 `page_size` 参数时，API 保持原有的数组返回格式，使用 `limit`/`offset` 行为。这样不破坏现有的 API 消费者。

## 前端变更

### `web/src/lib/api.ts`

`fetchContent` 参数扩展：

```typescript
export async function fetchContent(params?: {
  category?: string;
  min_signal?: number;
  limit?: number;
  sort_by?: "signal" | "time";
  sort_order?: "asc" | "desc";
  page?: number;
  page_size?: number;
}): Promise<{ items: ContentItem[]; total: number; page: number; page_size: number; total_pages: number }>
```

### `web/src/app/page.tsx`

新增状态：

```typescript
const [sortBy, setSortBy] = useState<"signal" | "time">("signal");
const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
const [page, setPage] = useState(1);
const [totalPages, setTotalPages] = useState(1);
```

fetchContent 调用改为传入排序和分页参数。切换排序或分类时重置 `page` 为 1。

### 排序下拉选择器

位于分类筛选栏旁边，4 个选项：

- 信号强度（高→低）：`sort_by=signal, sort_order=desc`
- 信号强度（低→高）：`sort_by=signal, sort_order=asc`
- 发布时间（新→旧）：`sort_by=time, sort_order=desc`
- 发布时间（旧→新）：`sort_by=time, sort_order=asc`

### 页码导航

位于 feed 列表底部，包含：
- 上一页 / 下一页按钮
- 页码数字（当前页高亮）
- 首页/末页快捷跳转（当总页数 > 5 时显示省略号）

## 涉及文件

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `api/main.py` | 修改 | 添加 `sort_by`、`sort_order`、`page`、`page_size` 参数，修改 SQL 排序和分页逻辑 |
| `api/models.py` | 修改 | 新增 `PaginatedContentResponse` 模型 |
| `web/src/lib/api.ts` | 修改 | `fetchContent` 扩展参数和返回类型 |
| `web/src/app/page.tsx` | 修改 | 添加排序下拉、页码导航、状态管理 |
| `web/src/components/Pagination.tsx` | 新建 | 页码导航组件 |
| `web/src/components/SortSelect.tsx` | 新建 | 排序下拉选择器组件 |

## 测试要点

1. 默认排序行为不变（信号强度降序）
2. 切换到时间排序后，结果按 `published_at` 正确排序
3. 升序/降序切换正确
4. 翻页导航正确显示页码，切换页码后内容更新
5. 切换排序或分类时页码重置为 1
6. 空结果时分页组件不显示或显示友好提示
