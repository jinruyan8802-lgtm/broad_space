from __future__ import annotations
import asyncio
import os
from datetime import datetime, timezone
from typing import Any, TYPE_CHECKING

try:
    from graphiti_core import Graphiti
    from graphiti_core.edges import EntityEdge
    GRAPHTI_AVAILABLE = True
except ImportError:
    GRAPHTI_AVAILABLE = False
    Graphiti = None  # type: ignore
    EntityEdge = None  # type: ignore


class GraphitiClient:
    def __init__(
        self,
        uri: str | None = None,
        user: str | None = None,
        password: str | None = None,
    ):
        self.uri = uri or os.environ.get("NEO4J_URI", "bolt://localhost:7687")
        self.user = user or os.environ.get("NEO4J_USER", "neo4j")
        self.password = password or os.environ.get("NEO4J_PASSWORD", "broadspace")
        self._client: Graphiti | None = None

    @property
    def client(self) -> Graphiti | None:
        if not GRAPHTI_AVAILABLE:
            return None
        if self._client is None:
            self._client = Graphiti(self.uri, self.user, self.password)
        return self._client

    async def add_triples(self, content_id: str, triples: list[dict], valid_at: datetime | None = None) -> bool:
        if not self.client:
            return False
        valid_at = valid_at or datetime.now(timezone.utc)
        for t in triples:
            try:
                await self.client.add_entity_edge(
                    EntityEdge(
                        source_node_name=t["subject"],
                        target_node_name=t["object"],
                        relation_type=t["predicate"],
                        fact=t.get("fact", f"{t['subject']} {t['predicate']} {t['object']}"),
                        valid_at=valid_at,
                    )
                )
            except Exception:
                return False
        return True

    async def search(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        if not self.client:
            return []
        try:
            results = await self.client.search(query, limit=limit)
            return [{"text": r.text, "score": r.score} for r in results]
        except Exception:
            return []

    def search_sync(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
        """Synchronous wrapper for async search()."""
        if not self.client:
            return []
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self.search(query, limit))
        finally:
            loop.close()

    def add_triples_batch(self, content_id: str, triples: list[dict]) -> bool:
        """Synchronous wrapper for async add_triples()."""
        if not self.client:
            return False
        loop = asyncio.new_event_loop()
        try:
            return loop.run_until_complete(self.add_triples(content_id, triples))
        finally:
            loop.close()