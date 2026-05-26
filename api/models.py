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