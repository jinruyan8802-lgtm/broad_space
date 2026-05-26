from datetime import datetime
from typing import Any

from pydantic import BaseModel


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


class AnalyticsResponse(BaseModel):
    signal_distribution: SignalDistribution
    category_counts: list[CategoryCount]
    sentiment_counts: SentimentCounts
    volume_timeline: list[VolumeDataPoint]
    source_counts: list[SourceCount]