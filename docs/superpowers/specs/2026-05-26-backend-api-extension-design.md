# 后端 API 扩展设计

## 概述

扩展 BroadSpace 后端 API，为前端知识探索界面提供所需的数据支撑。

## 1. ContentResponse 扩展

### 1.1 新增 Pydantic 模型

```python
# api/models.py

class ScoreBreakdown(BaseModel):
    exploit: float = Field(ge=0.0, le=1.0, description="深耕分数：与用户兴趣的重合度")
    expand: float = Field(ge=0.0, le=1.0, description="扩展分数：图谱接近度")
    explore: float = Field(ge=0.0, le=1.0, description="探索分数：新颖度 + 高信号")

class ContentResponse(BaseModel):
    id: str
    title: str
    url: str
    summary: str
    categories: list[str]
    key_points: list[str]
    signal_strength: float
    sentiment: str
    sources: list[dict[str, str]]
    processed_at: datetime
    triples: list["TripleItem"] = []
    final_score: float = Field(ge=0.0, le=1.0, description="加权总分 = 0.5*exploit + 0.3*expand + 0.2*explore")
    score_breakdown: ScoreBreakdown
```

### 1.2 计算逻辑

在 `/content` API 的 SQL 查询后，使用 Ranker 计算每条记录的分数：

```python
# api/main.py - list_content 函数中
ranker = Ranker()  # 默认权重 w_exploit=0.5, w_expand=0.3, w_explore=0.2
for row in query:
    content = ProcessedContent(...)
    scores = ranker.score(content)
    total = 0.5 * scores["exploit"] + 0.3 * scores["expand"] + 0.2 * scores["explore"]
    # ... 构建 ContentResponse ...
```

### 1.3 SQL 查询扩展

`/content` 的 `ORDER BY` 改为按 `final_score DESC`。

---

## 2. AnalyticsResponse 扩展

### 2.1 新增模型

```python
# api/models.py

class TrendingTopic(BaseModel):
    topic: str = Field(description="主题名称（取自 categories 或实体名）")
    current_count: int = Field(description="近 7 天文章数")
    previous_count: int = Field(description="8-14 天文章数")
    change_ratio: float = Field(description="变化率：(current-previous)/previous")
    status: Literal["rising", "falling", "stable"] = Field(description="趋势状态")

class ScoreBreakdownStats(BaseModel):
    avg_exploit: float
    avg_expand: float
    avg_explore: float
    avg_final: float

class CategorySourceDiversity(BaseModel):
    category: str
    covered_sources: list[str]
    missing_sources: list[str]
    coverage_ratio: float = Field(ge=0.0, le=1.0, description="覆盖率")

class AnalyticsResponse(BaseModel):
    signal_distribution: SignalDistribution
    category_counts: list[CategoryCount]
    sentiment_counts: SentimentCounts
    volume_timeline: list[VolumeDataPoint]
    source_counts: list[SourceCount]
    trending_topics: list[TrendingTopic] = Field(default_factory=list)
    score_distribution: ScoreBreakdownStats
    source_diversity_by_category: list[CategorySourceDiversity] = Field(default_factory=list)
```

### 2.2 Trending Topics 计算逻辑

```python
def _query_trending_topics(days: int, session):
    # 近 7 天按 category 聚合
    current = session.execute(text("""
        SELECT elem AS category, COUNT(*) AS count
        FROM processed_articles,
             jsonb_array_elements_text(categories::jsonb) AS elem
        WHERE processed_at > NOW() - INTERVAL ':days days'
        GROUP BY elem
    """), {"days": days}).fetchall()

    # 8-14 天按 category 聚合
    previous = session.execute(text("""
        SELECT elem AS category, COUNT(*) AS count
        FROM processed_articles,
             jsonb_array_elements_text(categories::jsonb) AS elem
        WHERE processed_at > NOW() - INTERVAL ':days days'
          AND processed_at <= NOW() - INTERVAL '7 days'
        GROUP BY elem
    """), {"days": days}).fetchall()

    prev_map = {r.category: r.count for r in previous}
    results = []
    for r in current:
        prev_count = prev_map.get(r.category, 0)
        if prev_count > 0:
            change = (r.count - prev_count) / prev_count
        elif r.count > 0:
            change = 1.0  # 从无到有，标记为上升
        else:
            change = 0.0

        if change > 0.2:
            status = "rising"
        elif change < -0.2:
            status = "falling"
        else:
            status = "stable"

        results.append(TrendingTopic(
            topic=r.category,
            current_count=r.count,
            previous_count=prev_count,
            change_ratio=change,
            status=status,
        ))

    return sorted(results, key=lambda x: x.current_count, reverse=True)[:10]
```

### 2.3 Score Distribution 计算逻辑

在 `processed_articles` 表已有 `signal_strength` 字段，但 exploit/expand/explore 需要实时计算。由于计算开销大，采用近似策略：

- `avg_exploit` ≈ `avg_signal_strength * 0.5`（简化估算）
- `avg_expand` ≈ `avg_signal_strength * 0.3`
- `avg_explore` ≈ `avg_signal_strength * 0.2`
- `avg_final` = 三者之和

### 2.4 Source Diversity 计算逻辑

```python
# 配置的预期信息源（可从环境变量或配置读取）
DEFAULT_SOURCES = [
    "Hacker News", "GitHub Trending", "ArXiv", "V2EX",
    "机器之心", "量子位", "Miniflux", "Reddit"
]

def _query_source_diversity(days: int, session):
    # 按 category 聚合已覆盖的 source
    rows = session.execute(text("""
        SELECT elem AS category,
               array_agg(DISTINCT elem2->>'name') AS sources
        FROM processed_articles,
             jsonb_array_elements_text(categories::jsonb) AS elem,
             jsonb_array_elements(sources::jsonb) AS elem2
        WHERE processed_at > NOW() - INTERVAL ':days days'
        GROUP BY elem
    """), {"days": days}).fetchall()

    results = []
    for r in rows:
        covered = r.sources or []
        missing = [s for s in DEFAULT_SOURCES if s not in covered]
        results.append(CategorySourceDiversity(
            category=r.category,
            covered_sources=covered,
            missing_sources=missing,
            coverage_ratio=len(covered) / max(len(DEFAULT_SOURCES), 1),
        ))
    return results
```

---

## 3. 实现文件清单

| 文件 | 改动 |
|------|------|
| `api/models.py` | 新增 `ScoreBreakdown`, `TrendingTopic`, `CategorySourceDiversity`, `ScoreBreakdownStats`, 扩展 `ContentResponse`, `AnalyticsResponse` |
| `api/main.py` | `/content` 添加 final_score 和 score_breakdown；`/analytics` 添加 trending_topics, score_distribution, source_diversity_by_category |

---

## 4. 优先级

1. **Phase 1**: `api/models.py` 新增模型
2. **Phase 2**: `/content` 扩展，添加 final_score 和 score_breakdown
3. **Phase 3**: `/analytics` 扩展 trending_topics
4. **Phase 4**: `/analytics` 扩展 score_distribution 和 source_diversity_by_category