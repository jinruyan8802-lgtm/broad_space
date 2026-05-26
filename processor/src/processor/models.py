from datetime import datetime
from typing import Any

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