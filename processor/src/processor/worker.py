import json
import logging
from typing import Any

import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from processor.llm.client import LLMClient
from processor.models import ProcessedContent, RawArticle
from processor.pipeline.analyzer import CrossSourceAnalyzer
from processor.pipeline.classifier import Classifier
from processor.pipeline.dedup import Deduplicator
from processor.pipeline.summarizer import Summarizer
from processor.worker_models import ProcessedArticle, Base

logger = logging.getLogger(__name__)


class Worker:
    def __init__(
        self,
        redis_url: str,
        db_url: str,
        llm: LLMClient,
        stream_key: str = "broadspace:articles",
        consumer_group: str = "processor",
    ):
        self.redis = redis.from_url(redis_url)
        self.stream_key = stream_key
        self.consumer_group = consumer_group
        self.llm = llm
        self.classifier = Classifier(llm)
        self.summarizer = Summarizer(llm)
        self.analyzer = CrossSourceAnalyzer(llm)

        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)

        self._ensure_consumer_group()

    def _ensure_consumer_group(self):
        try:
            self.redis.xgroup_create(self.stream_key, self.consumer_group, id="0", mkstream=True)
        except redis.ResponseError as e:
            if "already exists" not in str(e):
                raise

    def run(self, count: int = 10, block_ms: int = 5000):
        """Process batch of messages from Redis Streams."""
        dedup = Deduplicator()
        articles: list[RawArticle] = []

        # Read from stream
        messages = self.redis.xreadgroup(
            self.consumer_group,
            "worker-1",
            {self.stream_key: ">"},
            count=count,
            block=block_ms,
        )

        for stream_name, stream_messages in messages:
            for msg_id, fields in stream_messages:
                for key, value in fields.items():
                    try:
                        data = json.loads(value)
                        article = RawArticle(**data)
                        if not dedup.is_duplicate(article):
                            dedup.add(article)
                            articles.append(article)
                    except Exception as e:
                        logger.error(f"failed to parse message {msg_id}: {e}")

                # Acknowledge message
                self.redis.xack(self.stream_key, self.consumer_group, msg_id)

        if not articles:
            return []

        # Group by event for cross-source analysis
        groups = dedup.group_by_event(articles)
        results: list[ProcessedContent] = []

        for group in groups:
            processed = self._process_group(group)
            results.append(processed)
            self._save(processed)

        return results

    def _process_group(self, articles: list[RawArticle]) -> ProcessedContent:
        primary = articles[0]

        # Run pipeline steps
        categories = self.classifier.classify(primary)
        summary_result = self.summarizer.summarize(primary)
        analysis = self.analyzer.analyze(articles)

        return ProcessedContent(
            id=primary.hash,
            sources=[{"name": a.source_name, "url": a.url} for a in articles],
            canonical_url=primary.url,
            title=primary.title,
            summary=summary_result.get("summary", ""),
            key_points=summary_result.get("key_points", []),
            categories=categories,
            signal_strength=summary_result.get("signal_strength", 0.5),
            sentiment=summary_result.get("sentiment", "neutral"),
            cross_source_analysis=analysis,
            triples=[],
        )

    def _save(self, content: ProcessedContent):
        session = self.Session()
        try:
            db_article = ProcessedArticle(
                id=content.id,
                title=content.title,
                url=content.canonical_url,
                summary=content.summary,
                categories=content.categories,
                key_points=content.key_points,
                signal_strength=content.signal_strength,
                sentiment=content.sentiment,
                cross_source_analysis=content.cross_source_analysis,
                triples=content.triples,
                sources=content.sources,
            )
            session.merge(db_article)  # merge = upsert by primary key
            session.commit()
        finally:
            session.close()