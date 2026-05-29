from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class RawArticle(BaseModel):
    id: str
    title: str
    url: str
    source_name: str
    published_at: str | None = None
    content: str = ""
    fetched_at: str
    hash: str
    raw: dict[str, Any] = Field(default_factory=dict)


class ProcessedContent(BaseModel):
    id: str
    sources: list[dict[str, str]] = Field(default_factory=list)
    canonical_url: str = ""
    title: str
    summary: str = ""
    key_points: list[str] = Field(default_factory=list)
    categories: list[str] = Field(default_factory=list)
    signal_strength: float = Field(ge=0.0, le=1.0, default=0.0)
    sentiment: str = "neutral"
    cross_source_analysis: dict[str, Any] = Field(default_factory=dict)
    triples: list[dict[str, str]] = Field(default_factory=list)
    processed_at: datetime = Field(default_factory=datetime.utcnow)


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
    published_at: str | None = None
    triples: list["TripleItem"] = []
    final_score: float = Field(ge=0.0, le=1.0, description="加权总分 = 0.5*exploit + 0.3*expand + 0.2*explore")
    score_breakdown: ScoreBreakdown
    language: str = "en"
    title_zh: str = ""
    summary_zh: str = ""
    key_points_zh: list[str] = Field(default_factory=list)


class TripleItem(BaseModel):
    subject: str
    subject_zh: str
    predicate: str
    predicate_zh: str
    object: str
    object_zh: str
    confidence: str  # EXTRACTED | INFERRED | SPECULATIVE


class GraphSearchResult(BaseModel):
    text: str
    score: float
    entities: list[str]
    entity_names_zh: list[str]
    subject: str = ""
    subject_zh: str = ""
    subject_type: str = ""
    predicate: str = ""
    predicate_zh: str = ""
    object: str = ""
    object_zh: str = ""
    object_type: str = ""
    confidence: str = ""


class GraphSearchResponse(BaseModel):
    query: str
    results: list[GraphSearchResult]


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


class TrendingTopic(BaseModel):
    topic: str = Field(description="主题名称（取自 categories）")
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
    score_distribution: ScoreBreakdownStats = Field(default_factory=lambda: ScoreBreakdownStats(avg_exploit=0, avg_expand=0, avg_explore=0, avg_final=0))
    source_diversity_by_category: list[CategorySourceDiversity] = Field(default_factory=list)


class SourceHealthItem(BaseModel):
    source: str
    last_seen: str | None = None
    status: str = "offline"  # online | stale | offline


class KnowledgeGraphStats(BaseModel):
    nodes: int = 0
    edges: int = 0
    today_new_nodes: int = 0
    today_new_edges: int = 0


class RecentActivity(BaseModel):
    title: str
    source: str
    url: str
    processed_at: str
    signal_strength: float


class DashboardStatsResponse(BaseModel):
    today_articles: int
    total_articles: int
    graph: KnowledgeGraphStats
    source_health: list[SourceHealthItem]
    recent_activity: list[RecentActivity]


class PaginatedContentResponse(BaseModel):
    items: list[ContentResponse]
    total: int
    page: int
    page_size: int
    total_pages: int