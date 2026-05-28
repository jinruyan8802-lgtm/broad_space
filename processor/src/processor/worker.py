import json
import logging
import os
import sys
import time
from typing import Any

import redis
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from processor.llm.client import LLMClient
from processor.knowledge.extractor import TripleExtractor
from processor.knowledge.graphiti_client import GraphitiClient
from processor.models import ProcessedContent, RawArticle
from processor.pipeline.analyzer import CrossSourceAnalyzer
from processor.pipeline.classifier import Classifier
from processor.pipeline.dedup import Deduplicator
from processor.pipeline.summarizer import Summarizer
from processor.pipeline.translator import Translator
from processor.worker_models import ProcessedArticle, Base

logger = logging.getLogger("processor.worker")


def _setup_logging():
    """Configure logging to file with rotation-like daily suffix via append mode."""
    log_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "logs")
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, "processor.log")

    log_format = os.environ.get("LOG_FORMAT", "text")

    if log_format == "json":
        class JsonFormatter(logging.Formatter):
            def format(self, record):
                log_obj = {
                    "ts": self.formatTime(record),
                    "level": record.levelname,
                    "logger": record.name,
                    "msg": record.getMessage(),
                }
                if hasattr(record, "duration_ms"):
                    log_obj["duration_ms"] = record.duration_ms
                return json.dumps(log_obj, ensure_ascii=False)
        formatter = JsonFormatter()
    else:
        formatter = logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%dT%H:%M:%S%z",
        )

    handler = logging.FileHandler(log_path, mode="a", encoding="utf-8")
    handler.setFormatter(formatter)

    root = logging.getLogger("processor")
    root.setLevel(logging.INFO)
    root.addHandler(handler)

    # Also log SQLAlchemy warnings/errors
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.engine").addHandler(handler)


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
        self.translator = Translator(llm)
        self.analyzer = CrossSourceAnalyzer(llm)
        self.knowledge_extractor = TripleExtractor(llm)
        self.graphiti_client = GraphitiClient()
        logger.info("Knowledge extractor and Graphiti client initialized")

        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)

        self._ensure_consumer_group()
        logger.info("Worker initialized: stream=%s group=%s db=%s", stream_key, consumer_group, db_url)

    def _ensure_consumer_group(self):
        try:
            self.redis.xgroup_create(self.stream_key, self.consumer_group, id="0", mkstream=True)
            logger.info("Created consumer group %s", self.consumer_group)
        except redis.ResponseError as e:
            if "already exists" not in str(e):
                raise

    def run(self, count: int = 10, block_ms: int = 5000):
        """Process batch of messages from Redis Streams."""
        dedup = Deduplicator()
        articles: list[RawArticle] = []

        # Read from stream
        logger.info("Polling Redis stream: count=%d block_ms=%d", count, block_ms)
        messages = self.redis.xreadgroup(
            self.consumer_group,
            "worker-1",
            {self.stream_key: ">"},
            count=count,
            block=block_ms,
        )

        total_messages = sum(len(msgs) for _, msgs in messages)
        logger.info("Received %d messages from stream", total_messages)

        for stream_name, stream_messages in messages:
            for msg_id, fields in stream_messages:
                for key, value in fields.items():
                    try:
                        data = json.loads(value)
                        article = RawArticle(**data)
                        if not dedup.is_duplicate(article):
                            dedup.add(article)
                            articles.append(article)
                        else:
                            logger.debug("Duplicate article skipped: hash=%s", article.hash)
                    except Exception as e:
                        logger.error("failed to parse message %s: %s", msg_id, e)

                # Acknowledge message
                self.redis.xack(self.stream_key, self.consumer_group, msg_id)

        logger.info("Accepted %d unique articles after dedup", len(articles))

        if not articles:
            return []

        # Group by event for cross-source analysis
        groups = dedup.group_by_event(articles)
        results: list[ProcessedContent] = []
        logger.info("Processing %d event groups", len(groups))

        for idx, group in enumerate(groups, 1):
            start = time.perf_counter()
            processed = self._process_group(group)
            duration = time.perf_counter() - start
            results.append(processed)
            self._save(processed)
            logger.info(
                "Group %d/%d processed: id=%s title=%.50s duration_ms=%.1f",
                idx, len(groups), processed.id, processed.title, duration * 1000,
            )

        logger.info("Batch complete: %d articles -> %d processed results", len(articles), len(results))
        return results

    def _process_group(self, articles: list[RawArticle]) -> ProcessedContent:
        primary = articles[0]
        logger.debug("Processing group: primary=%s sources=%d", primary.hash, len(articles))

        # Run pipeline steps
        t0 = time.perf_counter()
        categories = self.classifier.classify(primary)
        t1 = time.perf_counter()
        logger.info("Classified %s: categories=%s duration_ms=%.1f", primary.hash, categories, (t1 - t0) * 1000)

        summary_result = self.summarizer.summarize(primary)
        signal = summary_result.get("signal_strength") or 0.5
        sentiment = summary_result.get("sentiment") or "neutral"
        t2 = time.perf_counter()
        logger.info(
            "Summarized %s: signal=%.2f sentiment=%s duration_ms=%.1f",
            primary.hash,
            signal,
            sentiment,
            (t2 - t1) * 1000,
        )

        # Translate to Chinese if English
        t0_trans = time.perf_counter()
        translation = self.translator.translate(
            title=primary.title,
            summary=summary_result.get("summary") or "",
            key_points=summary_result.get("key_points") or [],
        )
        t1_trans = time.perf_counter()
        logger.info(
            "Translated %s: language=%s duration_ms=%.1f",
            primary.hash, translation["language"], (t1_trans - t0_trans) * 1000,
        )

        analysis = self.analyzer.analyze(articles)
        t3 = time.perf_counter()
        logger.info(
            "Analyzed %s: paradigm=%s duration_ms=%.1f",
            primary.hash,
            analysis.get("paradigm_signal", False),
            (t3 - t2) * 1000,
        )

        t0_triples = time.perf_counter()
        triples = self.knowledge_extractor.extract(
            ProcessedContent(
                id=primary.hash,
                sources=[{"name": a.source_name, "url": a.url} for a in articles],
                canonical_url=primary.url,
                title=primary.title,
                summary=summary_result.get("summary") or "",
                key_points=summary_result.get("key_points") or [],
                categories=categories,
                signal_strength=signal,
                sentiment=sentiment,
                cross_source_analysis=analysis,
                triples=[],
            )
        )
        t1_triples = time.perf_counter()
        logger.info("Triple extraction for %s: count=%d duration_ms=%.1f",
           primary.hash, len(triples), (t1_triples - t0_triples) * 1000)

        return ProcessedContent(
            id=primary.hash,
            sources=[{"name": a.source_name, "url": a.url} for a in articles],
            canonical_url=primary.url,
            title=primary.title,
            summary=summary_result.get("summary") or "",
            key_points=summary_result.get("key_points") or [],
            categories=categories,
            signal_strength=signal,
            sentiment=sentiment,
            cross_source_analysis=analysis,
            triples=triples,
            published_at=primary.published_at,
            language=translation["language"],
            title_zh=translation["title_zh"],
            summary_zh=translation["summary_zh"],
            key_points_zh=translation["key_points_zh"],
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
                published_at=content.published_at,
                language=content.language,
                title_zh=content.title_zh,
                summary_zh=content.summary_zh,
                key_points_zh=content.key_points_zh,
            )
            session.merge(db_article)
            session.commit()
            logger.info("Saved to DB: id=%s", content.id)
            if self.graphiti_client and content.triples:
                try:
                    ok = self.graphiti_client.add_triples_batch(content.id, content.triples)
                    if ok:
                        logger.info("Triples written to Neo4j: content_id=%s count=%d",
                                   content.id, len(content.triples))
                    else:
                        logger.warning("Neo4j write returned False: content_id=%s", content.id)
                except Exception as e:
                    logger.warning("Failed to write triples to Neo4j for %s: %s", content.id, e)
        except Exception as e:
            logger.error("Failed to save id=%s: %s", content.id, e)
            raise
        finally:
            session.close()


if __name__ == "__main__":
    from dotenv import load_dotenv
    from pathlib import Path

    # Load .env from project root (two levels up from this file)
    env_path = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(env_path)

    _setup_logging()

    import os

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    db_user = os.environ.get("DB_USER", "broadspace")
    db_pass = os.environ.get("DB_PASSWORD", "change_me_in_production")
    db_name = os.environ.get("DB_NAME", "broadspace")
    db_host = os.environ.get("DB_HOST", "localhost")
    db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:5432/{db_name}"

    llm = LLMClient()
    worker = Worker(redis_url=redis_url, db_url=db_url, llm=llm)

    logger.info("Starting BroadSpace processor worker")
    try:
        while True:
            results = worker.run(count=10, block_ms=5000)
            if results:
                logger.info("Processed batch of %d articles", len(results))
    except KeyboardInterrupt:
        logger.info("Shutting down processor worker")
        sys.exit(0)
