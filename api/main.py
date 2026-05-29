import os
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from processor.knowledge.graphiti_client import GraphitiClient

from models import ContentResponse, PaginatedContentResponse, TripleItem, GraphSearchResponse, GraphSearchResult, AnalyticsResponse, SignalDistribution, CategoryCount, SentimentCounts, VolumeDataPoint, SourceCount, ScoreBreakdown, TrendingTopic, CategorySourceDiversity, ScoreBreakdownStats, DashboardStatsResponse, SourceHealthItem, KnowledgeGraphStats, RecentActivity

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

        for col in ["published_at", "language", "title_zh", "summary_zh", "key_points_zh"]:
            exists = session.execute(text("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name='processed_articles' AND column_name=:col
            """), {"col": col}).fetchall()
            if not exists:
                dtype = "JSONB DEFAULT '[]'" if col == "key_points_zh" else "TEXT DEFAULT ''"
                if col == "language":
                    dtype = "TEXT DEFAULT 'en'"
                session.execute(text(f"""
                    ALTER TABLE processed_articles
                    ADD COLUMN {col} {dtype}
                """))
                session.commit()
                print(f"Added {col} column to processed_articles")
    except Exception as e:
        print(f"Note: column migration error (may already exist): {e}")
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


@app.get("/content")
def list_content(
    category: str | None = Query(None, description="Filter by category"),
    min_signal: float = Query(0.0, ge=0.0, le=1.0),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    sort_by: str = Query("signal", description="Sort field: signal or time"),
    sort_order: str = Query("desc", description="Sort direction: asc or desc"),
    page: int | None = Query(None, ge=1, description="Page number (1-based), enables pagination mode"),
    page_size: int = Query(30, ge=1, le=100, description="Items per page"),
):
    if sort_by not in ("signal", "time"):
        sort_by = "signal"
    if sort_order not in ("asc", "desc"):
        sort_order = "desc"

    use_pagination = page is not None
    if use_pagination:
        effective_limit = page_size
        effective_offset = (page - 1) * page_size
    else:
        effective_limit = limit
        effective_offset = offset

    session = Session()
    try:
        # Build WHERE clause
        where_parts = [
            "FROM processed_articles WHERE signal_strength >= :min_signal"
        ]
        params: dict = {
            "min_signal": min_signal,
            "limit": effective_limit,
            "offset": effective_offset,
        }

        if category:
            where_parts.append("AND to_jsonb(categories) @> to_jsonb(:category_json)")
            params["category_json"] = [category]

        where_str = " ".join(where_parts)

        # Count query (pagination mode only)
        if use_pagination:
            count_result = session.execute(
                text(f"SELECT COUNT(*) AS total {where_str}"),
                params,
            )
            total = count_result.fetchone().total or 0
            total_pages = max(1, (total + page_size - 1) // page_size)

        # Sort clause
        if sort_by == "time":
            order_clause = f"ORDER BY published_at {sort_order.upper()} NULLS LAST"
        else:
            order_clause = f"ORDER BY signal_strength {sort_order.upper()}, processed_at DESC"

        # Data query
        data_query_str = f"""
            SELECT id, title, url, summary, categories, key_points,
                   signal_strength, sentiment, sources, processed_at, published_at, triples,
                   language, title_zh, summary_zh, key_points_zh
            {where_str}
            {order_clause}
            LIMIT :limit OFFSET :offset
        """
        query = session.execute(text(data_query_str), params)

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
                published_at=row.published_at,
                triples=triples_list,
                final_score=final_score,
                score_breakdown=ScoreBreakdown(
                    exploit=exploit,
                    expand=expand,
                    explore=explore,
                ),
                language=row.language or "en",
                title_zh=row.title_zh or "",
                summary_zh=row.summary_zh or "",
                key_points_zh=row.key_points_zh or [],
            ))

        if use_pagination:
            return PaginatedContentResponse(
                items=results,
                total=total,
                page=page,
                page_size=page_size,
                total_pages=total_pages,
            )
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
            subject_type=r.get("subject_type") or "Unknown",
            predicate=predicate,
            predicate_zh=predicate_zh,
            object=obj,
            object_zh=object_zh,
            object_type=r.get("object_type") or "Unknown",
            confidence=confidence,
        ))

    return GraphSearchResponse(query=query, results=results)


def _query_graph_stats():
    """Query Neo4j for knowledge graph statistics."""
    nodes = 0
    edges = 0
    today_new_edges = 0
    today_new_nodes = 0

    driver = _graphiti_client.driver
    if not driver:
        return KnowledgeGraphStats()

    try:
        with driver.session() as session:
            result = session.run("MATCH (n:Entity) RETURN count(n) AS cnt")
            record = result.single()
            nodes = record["cnt"] if record else 0

            result = session.run("MATCH ()-[r:RELATES]->() RETURN count(r) AS cnt")
            record = result.single()
            edges = record["cnt"] if record else 0

            result = session.run(
                "MATCH ()-[r:RELATES]->() WHERE r.valid_at >= date() RETURN count(r) AS cnt"
            )
            record = result.single()
            today_new_edges = record["cnt"] if record else 0
    except Exception:
        pass

    # Approximate today's new nodes from PG triples
    session_pg = Session()
    try:
        row = session_pg.execute(
            text("""
                SELECT COUNT(DISTINCT elem->>'subject') + COUNT(DISTINCT elem->>'object') AS cnt
                FROM processed_articles,
                     jsonb_array_elements(triples::jsonb) AS elem
                WHERE processed_at >= CURRENT_DATE
            """)
        ).fetchone()
        today_new_nodes = row.cnt if row and row.cnt else 0
    except Exception:
        pass
    finally:
        session_pg.close()

    return KnowledgeGraphStats(
        nodes=nodes,
        edges=edges,
        today_new_nodes=today_new_nodes,
        today_new_edges=today_new_edges,
    )


def _query_source_health(session):
    """Determine health status of each data source."""
    rows = session.execute(
        text("""
            SELECT (elem->>'name') AS source, MAX(processed_at) AS last_seen
            FROM processed_articles,
                 jsonb_array_elements(sources::jsonb) AS elem
            GROUP BY source
        """)
    ).fetchall()

    seen_map = {r.source: r.last_seen for r in rows}
    now = datetime.now(timezone.utc)
    results = []

    for src in DEFAULT_SOURCES:
        last_seen_dt = seen_map.get(src)
        if last_seen_dt:
            if last_seen_dt.tzinfo is None:
                last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)
            age_hours = (now - last_seen_dt).total_seconds() / 3600
            if age_hours < 24:
                status = "online"
            elif age_hours < 72:
                status = "stale"
            else:
                status = "offline"
            results.append(SourceHealthItem(
                source=src,
                last_seen=last_seen_dt.isoformat(),
                status=status,
            ))
        else:
            results.append(SourceHealthItem(source=src, last_seen=None, status="offline"))

    return results


def _query_recent_activity(session):
    """Get the 10 most recently processed articles."""
    rows = session.execute(
        text("""
            SELECT title, sources->0->>'name' AS source, url, processed_at, signal_strength
            FROM processed_articles
            ORDER BY processed_at DESC
            LIMIT 10
        """)
    ).fetchall()

    return [
        RecentActivity(
            title=r.title or "",
            source=r.source or "unknown",
            url=r.url or "",
            processed_at=r.processed_at.isoformat() if r.processed_at else "",
            signal_strength=r.signal_strength or 0.0,
        )
        for r in rows
    ]


@app.get("/dashboard/stats", response_model=DashboardStatsResponse)
def get_dashboard_stats():
    """
    返回仪表盘统计数据:
    - today_articles: 今日采集数
    - total_articles: 总文章数
    - graph: 知识图谱统计
    - source_health: 数据源健康状态
    - recent_activity: 最近处理的 10 条文章
    """
    session = Session()
    try:
        # Today's and total article counts
        row = session.execute(
            text("""
                SELECT
                    COUNT(*) FILTER (WHERE processed_at >= CURRENT_DATE) AS today_count,
                    COUNT(*) AS total_count
                FROM processed_articles
            """)
        ).fetchone()
        today_articles = row.today_count if row else 0
        total_articles = row.total_count if row else 0

        graph_stats = _query_graph_stats()
        source_health = _query_source_health(session)
        recent_activity = _query_recent_activity(session)

        return DashboardStatsResponse(
            today_articles=today_articles,
            total_articles=total_articles,
            graph=graph_stats,
            source_health=source_health,
            recent_activity=recent_activity,
        )
    finally:
        session.close()
