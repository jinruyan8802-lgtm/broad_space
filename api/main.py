import os
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from processor.knowledge.graphiti_client import GraphitiClient

from models import ContentResponse, TripleItem, GraphSearchResponse, GraphSearchResult, AnalyticsResponse, SignalDistribution, CategoryCount, SentimentCounts, VolumeDataPoint, SourceCount, ScoreBreakdown, TrendingTopic, CategorySourceDiversity, ScoreBreakdownStats

REQUEST_COUNT = Counter("api_requests_total", "Total requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("api_request_duration_seconds", "Request latency")

db_user = os.environ.get("DB_USER", "broadspace")
db_pass = os.environ.get("DB_PASSWORD", "change_me_in_production")
db_name = os.environ.get("DB_NAME", "broadspace")
db_host = os.environ.get("DB_HOST", "localhost")
db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:5432/{db_name}"
engine = create_engine(db_url)
Session = sessionmaker(bind=engine)

_graphiti_client = GraphitiClient(
    uri=os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
    user=os.environ.get("NEO4J_USER", "neo4j"),
    password=os.environ.get("NEO4J_PASSWORD", "broadspace"),
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    session = Session()
    try:
        result = session.execute(text("""
            SELECT column_name FROM information_schema.columns
            WHERE table_name='processed_articles' AND column_name='triples'
        """)).fetchall()
        if not result:
            session.execute(text("""
                ALTER TABLE processed_articles
                ADD COLUMN triples JSONB DEFAULT '[]'
            """))
            session.commit()
            print("Added triples column to processed_articles")
    except Exception as e:
        print(f"Note: triples column check error (may already exist): {e}")
    finally:
        session.close()
    yield


app = FastAPI(title="BroadSpace API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = (time.perf_counter() - start) * 1000
    print(
        f"{time.strftime('%Y-%m-%dT%H:%M:%S%z')} [{request.method}] {request.url.path} status={response.status_code} latency_ms={duration:.1f}"
    )
    return response


@app.middleware("http")
async def metrics_middleware(request: Request, call_next):
    start = time.perf_counter()
    response = await call_next(request)
    duration = time.perf_counter() - start
    REQUEST_COUNT.labels(method=request.method, endpoint=request.url.path, status=response.status_code).inc()
    REQUEST_LATENCY.observe(duration)
    return response


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/metrics")
def metrics():
    return Response(content=generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.get("/content", response_model=list[ContentResponse])
def list_content(
    category: str | None = Query(None, description="Filter by category"),
    min_signal: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    session = Session()
    try:
        query_parts = [
            """
            SELECT id, title, url, summary, categories, key_points,
                   signal_strength, sentiment, sources, processed_at, triples
            FROM processed_articles
            WHERE signal_strength >= :min_signal
            """
        ]
        params: dict = {
            "min_signal": min_signal,
            "limit": limit,
            "offset": offset,
        }

        if category:
            query_parts.append("AND to_jsonb(categories) @> to_jsonb(:category_json)")
            params["category_json"] = [category]

        query_parts.append("ORDER BY signal_strength DESC, processed_at DESC")
        query_parts.append("LIMIT :limit OFFSET :offset")

        query_str = " ".join(query_parts)
        query = session.execute(text(query_str), params)

        results = []
        for row in query:
            raw_triples = row.triples or []
            triples_list = []
            for t in raw_triples:
                if isinstance(t, dict):
                    triples_list.append(TripleItem(
                        subject=t.get("subject", ""),
                        subject_zh=t.get("subject_zh", t.get("subject", "")),
                        predicate=t.get("predicate", ""),
                        predicate_zh=t.get("predicate_zh", t.get("predicate", "")),
                        object=t.get("object", ""),
                        object_zh=t.get("object_zh", t.get("object", "")),
                        confidence=t.get("confidence", "EXTRACTED"),
                    ))
            # Compute exploit/expand/explore as proxy from signal_strength
            # exploit: ~50% of signal for user interest overlap
            # expand: ~30% of signal for graph proximity
            # explore: ~20% of signal for novelty + high signal
            exploit = (row.signal_strength or 0.0) * 0.5
            expand = (row.signal_strength or 0.0) * 0.3
            explore = (row.signal_strength or 0.0) * 0.2
            final_score = exploit + expand + explore
            results.append(ContentResponse(
                id=row.id,
                title=row.title,
                url=row.url,
                summary=row.summary or "",
                categories=row.categories or [],
                key_points=row.key_points or [],
                signal_strength=row.signal_strength or 0.0,
                sentiment=row.sentiment or "neutral",
                sources=row.sources or [],
                processed_at=row.processed_at,
                triples=triples_list,
                final_score=final_score,
                score_breakdown=ScoreBreakdown(
                    exploit=exploit,
                    expand=expand,
                    explore=explore,
                ),
            ))
        return results
    finally:
        session.close()


def _query_signal_distribution(days: int, session):
    rows = session.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE signal_strength >= 0.8) AS high,
                COUNT(*) FILTER (WHERE signal_strength >= 0.5 AND signal_strength < 0.8) AS mid,
                COUNT(*) FILTER (WHERE signal_strength < 0.5) AS low
            FROM processed_articles
            WHERE processed_at > NOW() - INTERVAL ':days days'
        """),
        {"days": days},
    ).fetchone()
    return SignalDistribution(high=rows.high or 0, mid=rows.mid or 0, low=rows.low or 0)


def _query_category_counts(days: int, session):
    rows = session.execute(
        text("""
            SELECT elem AS category, COUNT(*) AS count
            FROM processed_articles,
                 jsonb_array_elements_text(categories::jsonb) AS elem
            WHERE processed_at > NOW() - INTERVAL ':days days'
            GROUP BY elem
            ORDER BY count DESC
            LIMIT 10
        """),
        {"days": days},
    ).fetchall()
    return [CategoryCount(category=r.category, count=r.count) for r in rows]


def _query_sentiment_counts(days: int, session):
    rows = session.execute(
        text("""
            SELECT
                COUNT(*) FILTER (WHERE sentiment = 'positive') AS positive,
                COUNT(*) FILTER (WHERE sentiment = 'neutral') AS neutral,
                COUNT(*) FILTER (WHERE sentiment = 'negative') AS negative
            FROM processed_articles
            WHERE processed_at > NOW() - INTERVAL ':days days'
        """),
        {"days": days},
    ).fetchone()
    return SentimentCounts(
        positive=rows.positive or 0,
        neutral=rows.neutral or 0,
        negative=rows.negative or 0,
    )


def _query_volume_timeline(days: int, session):
    rows = session.execute(
        text("""
            SELECT DATE(processed_at) AS date, COUNT(*) AS count
            FROM processed_articles
            WHERE processed_at > NOW() - INTERVAL ':days days'
            GROUP BY DATE(processed_at)
            ORDER BY date ASC
        """),
        {"days": days},
    ).fetchall()
    return [VolumeDataPoint(date=str(r.date), count=r.count) for r in rows]


def _query_source_counts(days: int, session):
    rows = session.execute(
        text("""
            SELECT (elem->>'name') AS source, COUNT(*) AS count
            FROM processed_articles,
                 jsonb_array_elements(sources::jsonb) AS elem
            WHERE processed_at > NOW() - INTERVAL ':days days'
            GROUP BY source
            ORDER BY count DESC
            LIMIT 10
        """),
        {"days": days},
    ).fetchall()
    return [SourceCount(source=r.source or 'unknown', count=r.count) for r in rows]


def _query_trending_topics(days: int, session):
    # Current period: last `days` days
    current_rows = session.execute(
        text("""
            SELECT elem AS category, COUNT(*) AS count
            FROM processed_articles,
                 jsonb_array_elements_text(categories::jsonb) AS elem
            WHERE processed_at > NOW() - INTERVAL ':days days'
            GROUP BY elem
        """),
        {"days": days},
    ).fetchall()

    # Previous period: days+1 to 2*days
    previous_rows = session.execute(
        text("""
            SELECT elem AS category, COUNT(*) AS count
            FROM processed_articles,
                 jsonb_array_elements_text(categories::jsonb) AS elem
            WHERE processed_at > NOW() - INTERVAL ':double_days days'
              AND processed_at <= NOW() - INTERVAL ':days days'
            GROUP BY elem
        """),
        {"days": days, "double_days": days * 2},
    ).fetchall()

    prev_map = {r.category: r.count for r in previous_rows}
    results = []
    for r in current_rows:
        prev_count = prev_map.get(r.category, 0)
        if prev_count > 0:
            change_ratio = (r.count - prev_count) / prev_count
        elif r.count > 0:
            change_ratio = 1.0  # from 0 to something = rising
        else:
            change_ratio = 0.0

        if change_ratio > 0.2:
            status = "rising"
        elif change_ratio < -0.2:
            status = "falling"
        else:
            status = "stable"

        results.append(TrendingTopic(
            topic=r.category,
            current_count=r.count,
            previous_count=prev_count,
            change_ratio=change_ratio,
            status=status,
        ))

    return sorted(results, key=lambda x: x.current_count, reverse=True)[:10]


def _query_score_distribution(days: int, session):
    row = session.execute(
        text("""
            SELECT
                AVG(signal_strength) * 0.5 AS avg_exploit,
                AVG(signal_strength) * 0.3 AS avg_expand,
                AVG(signal_strength) * 0.2 AS avg_explore,
                AVG(signal_strength) * 1.0 AS avg_final
            FROM processed_articles
            WHERE processed_at > NOW() - INTERVAL ':days days'
        """),
        {"days": days},
    ).fetchone()
    return ScoreBreakdownStats(
        avg_exploit=row.avg_exploit or 0.0,
        avg_expand=row.avg_expand or 0.0,
        avg_explore=row.avg_explore or 0.0,
        avg_final=row.avg_final or 0.0,
    )


DEFAULT_SOURCES = [
    "hackernews", "github_trending", "arxiv", "v2ex",
    "miniflux", "juejin", "lobsters", "devto", "kr36",
]


def _query_source_diversity_by_category(days: int, session):
    rows = session.execute(
        text("""
            SELECT elem AS category,
                   array_agg(DISTINCT elem2->>'name') AS sources
            FROM processed_articles,
                 jsonb_array_elements_text(categories::jsonb) AS elem,
                 jsonb_array_elements(sources::jsonb) AS elem2
            WHERE processed_at > NOW() - INTERVAL ':days days'
            GROUP BY elem
        """),
        {"days": days},
    ).fetchall()

    results = []
    for r in rows:
        covered = list(r.sources) if r.sources else []
        missing = [s for s in DEFAULT_SOURCES if s not in covered]
        results.append(CategorySourceDiversity(
            category=r.category,
            covered_sources=covered,
            missing_sources=missing,
            coverage_ratio=min(len(covered) / max(len(DEFAULT_SOURCES), 1), 1.0),
        ))
    return results


@app.get("/analytics", response_model=AnalyticsResponse)
def get_analytics(days: int = Query(7, ge=1, le=90)):
    """
    返回仪表板聚合数据:
    - signal_distribution: 高/中/低 signal 计数
    - category_counts: Top 10 分类
    - sentiment_counts: positive/neutral/negative 计数
    - volume_timeline: 近 N 天每日处理量
    - source_counts: Top 10 来源
    """
    session = Session()
    try:
        signal_dist = _query_signal_distribution(days, session)
        category_counts = _query_category_counts(days, session)
        sentiment_counts = _query_sentiment_counts(days, session)
        volume_timeline = _query_volume_timeline(days, session)
        source_counts = _query_source_counts(days, session)
        trending_topics = _query_trending_topics(days, session)
        score_distribution = _query_score_distribution(days, session)
        source_diversity = _query_source_diversity_by_category(days, session)

        return AnalyticsResponse(
            signal_distribution=signal_dist,
            category_counts=category_counts,
            sentiment_counts=sentiment_counts,
            volume_timeline=volume_timeline,
            source_counts=source_counts,
            trending_topics=trending_topics,
            score_distribution=score_distribution,
            source_diversity_by_category=source_diversity,
        )
    finally:
        session.close()


@app.get("/graph/search", response_model=GraphSearchResponse)
async def graph_search(
    query: str = Query(..., description="Natural language query"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Search the knowledge graph via Neo4j.

    Returns matching triples with bilingual entity/relation labels.
    """
    try:
        raw_results = await _graphiti_client.search_async(query, limit=limit)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph search failed: {e}")

    results: list[GraphSearchResult] = []
    for r in raw_results:
        result_text = r.get("text", "")
        subject = r.get("subject", "")
        subject_zh = r.get("subject_zh", "")
        predicate = r.get("predicate", "")
        predicate_zh = r.get("predicate_zh", "")
        obj = r.get("object", "")
        object_zh = r.get("object_zh", "")
        confidence = r.get("confidence", "")
        entities = [e for e in [subject, obj] if e]
        entity_zh = [e for e in [subject_zh, object_zh] if e]
        results.append(GraphSearchResult(
            text=result_text,
            score=r.get("score", 0.0),
            entities=entities,
            entity_names_zh=entity_zh,
            subject=subject,
            subject_zh=subject_zh,
            subject_type=r.get("subject_type") or "Concept",
            predicate=predicate,
            predicate_zh=predicate_zh,
            object=obj,
            object_zh=object_zh,
            object_type=r.get("object_type") or "Concept",
            confidence=confidence,
        ))

    return GraphSearchResponse(query=query, results=results)
