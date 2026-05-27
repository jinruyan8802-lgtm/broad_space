# PRD: 数据管线修复与数据源扩展

**项目:** BroadSpace — 数据质量修复 + 数据源扩展
**日期:** 2026/05/27
**状态:** 设计完成

---

## 1. 背景与问题

### 1.1 LLM 管线完全失效（已修复）

数据库中 105 条数据全部是 fallback 默认值：

| 字段 | 实际值 | 期望值 |
|------|--------|--------|
| categories | `["Other"]` (100%) | `["AI/ML"]`, `["Infrastructure"]` 等 |
| signal_strength | `0.5` (100%) | 动态值如 `0.45`, `0.65` |
| sentiment | `"neutral"` (100%) | `positive`, `neutral`, `cautious` |
| summary | 直接复制标题 | LLM 真实摘要 |
| key_points | `[]` | 3 个关键点 |
| triples | `[]` | 知识图谱三元组 |

**根因**: MiniMax M2.7 是 reasoning 模型，响应格式为 `{html}<think>推理过程</think>\n\n{JSON}`。`_extract_json()` 未处理 `<think>` 标签，直接 `json.loads()` 整段文本导致解析失败。

**修复状态**: 已完成（2 处代码改动 + 数据清理 + processor 重启）。当前 processor 正在消费 Redis 中的 4604 条排队数据。

### 1.2 数据源覆盖不足（待修复）

当前 5 个数据源中只有 2 个真正采集到数据：

| 源 | 状态 | 问题 |
|---|---|---|
| GitHub Trending | ✅ 正常 (57 条) | 内容只有 repo 简介，较薄 |
| ArXiv | ⚠️ 有缺陷 (50 条) | 日期硬编码 `20260524-20260525`，不会自动更新 |
| HackerNews | ❌ 0 条 | 代码直接 `return []Article{}, nil`（注释 "For Phase 1"） |
| Miniflux RSS | ❌ 0 条 | Miniflux 实例为空，没有配置任何 RSS 订阅源 |
| V2EX | ❌ 0 条 | 网络不可达或超时 |

---

## 2. 目标

1. **修复现有 3 个问题源**: HN、ArXiv、V2EX
2. **给 Miniflux 添加高质量 RSS 订阅**
3. **新增 4 个数据源**: 掘金、Lobsters、Dev.to、36氪
4. **最终覆盖 9 个数据源**, 中英文兼顾

---

## 3. 技术方案

### 3.1 LLM 管线修复（已完成）

#### 3.1.1 `_extract_json` 标签剥离

**文件**: `processor/src/processor/llm/client.py`

```python
def _extract_json(self, text: str) -> dict[str, Any]:
    text = text.strip()
    # Strip {html}<think>...{/html}</think> blocks from reasoning models
    if "</think>" in text:
        text = text.split("</think>")[-1].strip()
    # ... existing markdown strip logic ...
```

#### 3.1.2 Triple Extractor max_tokens 增加

**文件**: `processor/src/processor/knowledge/extractor.py`

每条 triple 有 6 个字段（subject/subject_zh/predicate/predicate_zh/object/object_zh + confidence），2048 tokens 容易截断。改为 `max_tokens=4096`。

#### 3.1.3 数据清理

清空 `processed_articles` 表中的 105 条 fallback 数据，让 processor 重新处理。

### 3.2 修复现有源

#### 3.2.1 HackerNews（`collector/internal/source/scraper.go` 中的 `NewHackerNews`）

当前实现只获取 top story ID 列表然后直接返回空数组。需要改为：

1. 获取 `https://hacker-news.firebaseio.com/v0/topstories.json` → 得到 ID 列表
2. 对每个 ID 请求 `https://hacker-news.firebaseio.com/v0/item/{id}.json` → 得到 title/url/text
3. 构造 Article 返回

建议限制前 50 条 top stories，使用 goroutine 并发请求（复用现有 semaphore 模式）。

#### 3.2.2 ArXiv（`collector/internal/source/arxiv.go`）

当前硬编码日期：
```
submittedDate:[202605240000+TO+202605252359]
```

改为动态计算最近 2 天：
```go
now := time.Now()
yesterday := now.AddDate(0, 0, -1)
dateRange := fmt.Sprintf("submittedDate:[%s+TO+%s]",
    yesterday.Format("20060102")+"0000",
    now.Format("20060102")+"2359")
```

#### 3.2.3 V2EX（`collector/internal/source/v2ex.go`）

当前可能因网络问题超时。在 `ScraperSource.Fetch` 中添加重试逻辑（最多 3 次，间隔 2s）。如果 3 次全部失败，在 collector 日志中标记 `source v2ex: skipped (unreachable)` 并继续其他源，不阻塞整个采集周期。

### 3.3 Miniflux RSS 订阅

Miniflux 已运行（port 8080, healthy），但没有订阅任何 feed。通过 Miniflux API（`POST /v1/feeds`，Basic Auth admin:admin123）一次性添加以下 RSS 源。这是运维操作，不需要改 collector 代码——Miniflux 源会通过现有 `NewMiniflux` 接口自动采集。

| Feed URL | 名称 | 类型 |
|----------|------|------|
| `https://hnrss.org/best` | Hacker News Best | 英文综合 |
| `https://techcrunch.com/feed/` | TechCrunch | 英文科技新闻 |
| `https://www.theverge.com/rss/index.xml` | The Verge | 英文科技资讯 |
| `https://www.jiqizhixin.com/rss` | 机器之心 | 中文 AI/ML |
| `https://sspai.com/feed` | 少数派 | 中文效率工具 |

通过 `POST /v1/feeds` API 添加（已有 admin 认证）。

### 3.4 新增数据源

遵循现有 `source.Source` 接口和 `ScraperSource` 模式，每个源一个独立 `.go` 文件。

#### 3.4.1 掘金（`collector/internal/source/juejin.go`）

- **API**: `POST https://api.juejin.cn/recommend_api/v1/article/recommend_all_feed`
- **Body**: `{"id_type":2,"sort_type":200,"cate_id":"","cursor":"0","limit":50}`
- **认证**: 无需
- **解析**: 返回 `data[].article_info.{title,brief_content,article_url}`
- **Source Name**: `"juejin"`

#### 3.4.2 Lobsters（`collector/internal/source/lobsters.go`）

- **API**: `GET https://lobste.rs/hottest.json`
- **认证**: 无需
- **解析**: 返回数组 `[{title, url, tags, score, comments_url}]`
- **Source Name**: `"lobsters"`

#### 3.4.3 Dev.to（`collector/internal/source/devto.go`）

- **API**: `GET https://dev.to/api/articles?top=1&per_page=50`
- **认证**: 无需
- **解析**: 返回数组 `[{title, url, description, tag_list, public_reactions_count}]`
- **Source Name**: `"devto"`

#### 3.4.4 36氪（`collector/internal/source/kr36.go`）

- **API**: `GET https://36kr.com/feed` (RSS XML)
- **认证**: 无需
- **解析**: RSS XML `<item>` 元素，复用现有 `rss.go` 的 XML 解析模式
- **Source Name**: `"kr36"`

### 3.5 Collector 配置更新

`collector/cmd/collector/main.go` 中 sources 列表更新为：

```go
sources := []source.Source{
    source.NewMiniflux(cfg.MinifluxURL, cfg.MinifluxUser, cfg.MinifluxPass),
    source.NewHackerNews(),
    source.NewGitHubTrending(),
    source.NewArXiv(),
    source.NewV2EX(),
    source.NewJuejin(),    // 新增
    source.NewLobsters(),  // 新增
    source.NewDevTo(),     // 新增
    source.NewKr36(),      // 新增
}
```

---

## 4. 不在范围内

- **前端 UI 改动** — 不涉及（前端已能展示分类/信号/情感数据）
- **API 改动** — 不涉及（`/content` 和 `/analytics` 已有）
- **Processor 逻辑改动** — 不涉及（`</think>` 修复已完成）
- **Neo4j 图谱查询优化** — 后续迭代
- **Zhihu 源** — 需要认证，暂不处理
- **Collector 容器化** — 当前手动运行，后续再考虑

---

## 5. 验证标准

### 5.1 LLM 管线验证（已完成）

- [x] `_extract_json` 能正确解析 `<think>` 标签包裹的 JSON
- [x] Classifier 返回真实分类（非 `"Other"`）
- [x] Summarizer 返回动态 signal_strength 和 sentiment
- [x] Triple Extractor 返回非空三元组列表

### 5.2 数据源验证

- [ ] HN: `source hackernews: fetched N articles` 日志输出，N > 0
- [ ] ArXiv: 查询日期自动更新（不硬编码）
- [ ] V2EX: 日志中不再报错或标记为跳过
- [ ] Miniflux: `GET /v1/entries` 返回 RSS 文章
- [ ] 掘金: `source juejin: fetched N articles` 日志输出
- [ ] Lobsters: `source lobsters: fetched N articles` 日志输出
- [ ] Dev.to: `source devto: fetched N articles` 日志输出
- [ ] 36氪: `source kr36: fetched N articles` 日志输出

### 5.3 端到端验证

- [ ] `/analytics` API 返回 9 个不同 source（非只有 2 个）
- [ ] `category_counts` 包含多种分类（非只有 `"Other"`）
- [ ] `sentiment_counts` 包含多种情感
- [ ] `signal_distribution` 值有变化（非全部 mid）

---

## 6. 实施计划

### Phase 1: LLM 管线修复（已完成）

1. ✅ 修复 `_extract_json` 处理 `<think>` 标签
2. ✅ Triple extractor max_tokens 增加到 4096
3. ✅ 清空 processed_articles 表
4. ✅ 重启 processor，验证数据质量

### Phase 2: 修复现有源

1. 修改 `collector/internal/source/scraper.go` 中 `NewHackerNews()` 实现
2. 修改 `collector/internal/source/arxiv.go` 动态日期
3. 检查 V2EX 网络连通性，添加日志标记

### Phase 3: 新增源 + Miniflux

1. 新增 `juejin.go`, `lobsters.go`, `devto.go`, `kr36.go`
2. 更新 `main.go` sources 列表
3. 通过 Miniflux API 添加 RSS 订阅源
4. 重新编译 collector
5. 运行一轮完整采集，验证所有源

### Phase 4: 验证

1. 检查 collector 日志确认每个源采集成功
2. 检查 processor 日志确认 LLM 处理正常
3. 调用 `/analytics` API 验证数据多样性
4. 前端页面查看效果
