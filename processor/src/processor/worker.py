import asyncio
import json
import logging
import os
import sys
import time
from typing import Any

import redis
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from processor.llm.client import LLMClient
from processor.knowledge.extractor import TripleExtractor
from processor.knowledge.graphiti_client import GraphitiClient
from processor.models import ProcessedContent, RawArticle
from processor.pipeline.analyzer import CrossSourceAnalyzer
from processor.pipeline.classifier import Classifier
from processor.pipeline.dedup import Deduplicator
from processor.pipeline.ranker import Ranker
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
        max_concurrent_groups: int = 3,
        consumer_name: str = "worker-1",
    ):
        self.redis = redis.from_url(redis_url)
        self.stream_key = stream_key
        self.consumer_group = consumer_group
        self.consumer_name = consumer_name
        self.llm = llm
        self.classifier = Classifier(llm)
        self.summarizer = Summarizer(llm)
        self.translator = Translator(llm)
        self.analyzer = CrossSourceAnalyzer(llm)
        self.knowledge_extractor = TripleExtractor(llm)
        self.graphiti_client = GraphitiClient()
        self.ranker = Ranker(graphiti_client=self.graphiti_client)
        self._semaphore = asyncio.Semaphore(max_concurrent_groups)
        logger.info(
            "Worker initialized: stream=%s group=%s consumer=%s max_concurrent=%d",
            stream_key, consumer_group, consumer_name, max_concurrent_groups,
        )

        engine = create_engine(db_url)
        Base.metadata.create_all(engine)
        self.Session = sessionmaker(bind=engine)

        self._ensure_columns(engine)
        self._ensure_consumer_group()

    def _ensure_columns(self, engine):
        """Auto-migrate missing columns (idempotent)."""
        from sqlalchemy.orm import sessionmaker
        Session = sessionmaker(bind=engine)
        session = Session()
        try:
            # Check if final_score column exists
            result = session.execute(
                text("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name='processed_articles' AND column_name='final_score'
                """)
            ).fetchall()
            if not result:
                session.execute(
                    text("""
                        ALTER TABLE processed_articles
                        ADD COLUMN final_score FLOAT DEFAULT 0.0
                    """)
                )
                session.commit()
                logger.info("Added final_score column to processed_articles")
        except Exception as e:
            logger.warning("Column migration note (may already exist): %s", e)
        finally:
            session.close()

    def _ensure_consumer_group(self):
        try:
            self.redis.xgroup_create(self.stream_key, self.consumer_group, id="0", mkstream=True)
            logger.info("Created consumer group %s", self.consumer_group)
        except redis.ResponseError as e:
            if "already exists" not in str(e):
                raise

    async def run_async(self, count: int = 10, block_ms: int = 5000):
        """Process batch of messages from Redis Streams with concurrent group handling."""
        dedup = Deduplicator()
        articles: list[RawArticle] = []

        # Read from Redis (sync I/O, offload to thread)
        logger.info("Polling Redis stream: count=%d block_ms=%d", count, block_ms)
        messages = await asyncio.to_thread(
            self.redis.xreadgroup,
            self.consumer_group,
            self.consumer_name,
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
                await asyncio.to_thread(
                    self.redis.xack,
                    self.stream_key,
                    self.consumer_group,
                    msg_id,
                )

        logger.info("Accepted %d unique articles after dedup", len(articles))

        if not articles:
            return []

        # Group by event for cross-source analysis
        groups = dedup.group_by_event(articles)
        results: list[ProcessedContent] = []
        logger.info(
            "Processing %d event groups (max concurrency=%d)",
            len(groups), self._semaphore._value,
        )

        async def _process_one(group: list[RawArticle], idx: int, total: int) -> ProcessedContent:
            async with self._semaphore:
                start = time.perf_counter()
                processed = await self._process_group_async(group)
                duration = time.perf_counter() - start
                logger.info(
                    "Group %d/%d processed: id=%s title=%.50s duration_ms=%.1f",
                    idx, total, processed.id, processed.title, duration * 1000,
                )
                return processed

        # Launch all groups concurrently (semaphore limits actual parallelism)
        tasks = [
            _process_one(g, i + 1, len(groups))
            for i, g in enumerate(groups)
        ]
        results = await asyncio.gather(*tasks)

        # Save results (sequential to avoid excessive DB connection contention)
        for processed in results:
            await self._save_async(processed)

        logger.info("Batch complete: %d articles -> %d processed results", len(articles), len(results))
        return results

    async def _process_group_async(self, articles: list[RawArticle]) -> ProcessedContent:
        """Process a single event group with parallel LLM calls where possible."""
        primary = articles[0]
        logger.debug("Processing group: primary=%s sources=%d", primary.hash, len(articles))

        # Step 1: Parallelize independent LLM calls.
        # classify(), summarize(), and analyze() have no dependencies on each other.
        t0 = time.perf_counter()
        classify_task = asyncio.to_thread(self.classifier.classify, primary)
        summarize_task = asyncio.to_thread(self.summarizer.summarize, primary)
        analyze_task = asyncio.to_thread(self.analyzer.analyze, articles)

        categories, summary_result, analysis = await asyncio.gather(
            classify_task, summarize_task, analyze_task,
            return_exceptions=True,
        )

        # Handle exceptions from parallel tasks
        if isinstance(categories, Exception):
            logger.warning("Classification failed for %s: %s", primary.hash, categories)
            categories = ["Other"]
        if isinstance(summary_result, Exception):
            logger.warning("Summarization failed for %s: %s", primary.hash, summary_result)
            summary_result = {
                "summary": primary.title,
                "key_points": [],
                "signal_strength": 0.5,
                "sentiment": "neutral",
            }
        if isinstance(analysis, Exception):
            logger.warning("Analysis failed for %s: %s", primary.hash, analysis)
            analysis = {
                "consensus": primary.title,
                "divergence": "Analysis failed.",
                "related_trends": [],
                "paradigm_signal": False,
            }

        t1 = time.perf_counter()
        logger.info(
            "Parallel classify+summarize+analyze for %s: categories=%s signal=%.2f paradigm=%s duration_ms=%.1f",
            primary.hash,
            categories,
            summary_result.get("signal_strength") or 0.5,
            analysis.get("paradigm_signal", False),
            (t1 - t0) * 1000,
        )

        signal = summary_result.get("signal_strength") or 0.5
        sentiment = summary_result.get("sentiment") or "neutral"

        # Step 2: Translate depends on summary output.
        t0_trans = time.perf_counter()
        translation = await asyncio.to_thread(
            self.translator.translate,
            title=primary.title,
            summary=summary_result.get("summary") or "",
            key_points=summary_result.get("key_points") or [],
        )
        t1_trans = time.perf_counter()
        logger.info(
            "Translated %s: language=%s duration_ms=%.1f",
            primary.hash, translation["language"], (t1_trans - t0_trans) * 1000,
        )

        # Step 3: Build content object (no I/O).
        content = ProcessedContent(
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
            triples=[],  # populated below
            published_at=primary.published_at,
            language=translation["language"],
            title_zh=translation["title_zh"],
            summary_zh=translation["summary_zh"],
            key_points_zh=translation["key_points_zh"],
        )

        # Step 4: Extract triples (depends on full content).
        t0_triples = time.perf_counter()
        triples = await asyncio.to_thread(self.knowledge_extractor.extract, content)
        content.triples = triples
        t1_triples = time.perf_counter()
        logger.info(
            "Triple extraction for %s: count=%d duration_ms=%.1f",
            primary.hash, len(triples), (t1_triples - t0_triples) * 1000,
        )

        # Step 5: Ranker scoring (compute final_score from EEE model).
        scores = self.ranker.score(content)
        content.final_score = (
            0.5 * scores["exploit"] +
            0.3 * scores["expand"] +
            0.2 * scores["explore"]
        )
        logger.info(
            "Ranked %s: final_score=%.3f exploit=%.3f expand=%.3f explore=%.3f",
            primary.hash, content.final_score,
            scores["exploit"], scores["expand"], scores["explore"],
        )

        return content

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
                final_score=content.final_score,
            )
            session.merge(db_article)
            session.commit()
            logger.info("Saved to DB: id=%s final_score=%.3f", content.id, content.final_score)
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

    async def _save_async(self, content: ProcessedContent):
        """Async wrapper for _save() — runs DB I/O in a thread."""
        return await asyncio.to_thread(self._save, content)

    # Backward-compatible synchronous wrapper
    def run(self, count: int = 10, block_ms: int = 5000):
        """Synchronous wrapper for backward compatibility."""
        return asyncio.run(self.run_async(count=count, block_ms=block_ms))


async def _main_loop():
    """Async main loop: continuously poll and process batches."""
    from dotenv import load_dotenv
    from pathlib import Path

    # Load .env from project root (two levels up from this file)
    env_path = Path(__file__).resolve().parents[3] / ".env"
    load_dotenv(env_path)

    _setup_logging()

    redis_url = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
    db_user = os.environ.get("DB_USER", "broadspace")
    db_pass = os.environ.get("DB_PASSWORD", "change_me_in_production")
    db_name = os.environ.get("DB_NAME", "broadspace")
    db_host = os.environ.get("DB_HOST", "localhost")
    db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:5432/{db_name}"

    max_concurrent = int(os.environ.get("PROCESSOR_MAX_CONCURRENT", "3"))
    consumer_name = os.environ.get("PROCESSOR_CONSUMER_NAME", "worker-1")

    llm = LLMClient()
    worker = Worker(
        redis_url=redis_url,
        db_url=db_url,
        llm=llm,
        max_concurrent_groups=max_concurrent,
        consumer_name=consumer_name,
    )

    logger.info(
        "Starting BroadSpace processor worker (async mode, max_concurrent=%d, consumer=%s)",
        max_concurrent, consumer_name,
    )
    while True:
        results = await worker.run_async(count=10, block_ms=5000)
        if results:
            logger.info("Processed batch of %d articles", len(results))


if __name__ == "__main__":
    try:
        asyncio.run(_main_loop())
    except KeyboardInterrupt:
        logger.info("Shutting down processor worker")
        sys.exit(0)
