from __future__ import annotations
import asyncio
import logging
import os
from datetime import datetime, timezone
from typing import Any

try:
    from neo4j import GraphDatabase, Driver
    NEO4J_AVAILABLE = True
except ImportError:
    NEO4J_AVAILABLE = False
    GraphDatabase = None  # type: ignore
    Driver = None  # type: ignore

logger = logging.getLogger(__name__)


class GraphitiClient:
    """Stores and searches knowledge graph triples in Neo4j using the neo4j driver directly."""

    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
    ):
        self.uri = uri or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.environ.get("NEO4J_USER", "neo4j")
        self.password = password or os.environ.get("NEO4J_PASSWORD", "broadspace")
        self._driver: Driver | None = None

    @property
    def driver(self) -> Driver | None:
        if not NEO4J_AVAILABLE:
            return None
        if self._driver is None:
            self._driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))
        return self._driver

    def add_triples(self, content_id: str, triples: list[dict], valid_at: datetime | None = None) -> bool:
        if not self.driver:
            return False
        valid_at = valid_at or datetime.now(timezone.utc)
        all_ok = True
        with self.driver.session() as session:
            for t in triples:
                try:
                    session.run(
                        """
                        MERGE (s:Entity {name: $subject})
                        SET s.entity_type = $subject_type, s.name_zh = $subject_zh
                        MERGE (o:Entity {name: $object})
                        SET o.entity_type = $object_type, o.name_zh = $object_zh
                        MERGE (s)-[r:RELATES {source_id: $content_id, predicate: $predicate}]->(o)
                        SET r.fact = $fact,
                            r.subject_zh = $subject_zh,
                            r.predicate_zh = $predicate_zh,
                            r.object_zh = $object_zh,
                            r.confidence = $confidence,
                            r.valid_at = $valid_at
                        """,
                        subject=t.get("subject", ""),
                        object=t.get("object", ""),
                        predicate=t.get("predicate", ""),
                        content_id=content_id,
                        fact=t.get("fact", f"{t.get('subject', '')} {t.get('predicate', '')} {t.get('object', '')}"),
                        subject_zh=t.get("subject_zh", ""),
                        subject_type=t.get("subject_type", "Concept"),
                        predicate_zh=t.get("predicate_zh", ""),
                        object_zh=t.get("object_zh", ""),
                        object_type=t.get("object_type", "Concept"),
                        confidence=t.get("confidence", "EXTRACTED"),
                        valid_at=valid_at.isoformat(),
                    )
                except Exception as e:
                    logger.warning("Failed to add triple %s -> %s: %s", t.get("subject"), t.get("object"), e)
                    all_ok = False
        return all_ok

    def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        if not self.driver:
            return []
        try:
            with self.driver.session() as session:
                result = session.run(
                    """
                    MATCH (s:Entity)-[r:RELATES]->(o:Entity)
                    WHERE s.name CONTAINS $search_term
                       OR o.name CONTAINS $search_term
                       OR r.fact CONTAINS $search_term
                    RETURN s.name AS subject, r.predicate AS predicate,
                           o.name AS object, r.fact AS text,
                           r.subject_zh AS subject_zh,
                           r.predicate_zh AS predicate_zh,
                           r.object_zh AS object_zh,
                           r.confidence AS confidence,
                           s.entity_type AS subject_type,
                           o.entity_type AS object_type
                    LIMIT $limit
                    """,
                    search_term=query,
                    limit=limit,
                )
                data = result.data()
                results = []
                for row in data:
                    text = row.get("text") or f"{row['subject']} {row['predicate']} {row['object']}"
                    results.append({
                        "text": text,
                        "score": 1.0,
                        "subject": row.get("subject", ""),
                        "subject_zh": row.get("subject_zh", ""),
                        "subject_type": row.get("subject_type") or "Unknown",
                        "predicate": row.get("predicate", ""),
                        "predicate_zh": row.get("predicate_zh", ""),
                        "object": row.get("object", ""),
                        "object_zh": row.get("object_zh", ""),
                        "object_type": row.get("object_type") or "Unknown",
                        "confidence": row.get("confidence", ""),
                    })
                return results
        except Exception as e:
            logger.warning("Graph search failed: %s", e)
            return []

    async def search_async(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Async wrapper for search() - runs sync search in thread pool."""
        return await asyncio.to_thread(self.search, query, limit)

    async def add_triples_async(self, content_id: str, triples: list[dict], valid_at: datetime | None = None) -> bool:
        """Async wrapper for add_triples() - runs sync add_triples in thread pool."""
        return await asyncio.to_thread(self.add_triples, content_id, triples, valid_at)

    # Keep old method names as aliases for backward compatibility
    def search_sync(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        return self.search(query, limit)

    def add_triples_batch(self, content_id: str, triples: list[dict]) -> bool:
        return self.add_triples(content_id, triples)
