import os
import time

from fastapi import FastAPI, Query, HTTPException, Request
from fastapi.responses import Response
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from models import ContentResponse

REQUEST_COUNT = Counter("api_requests_total", "Total requests", ["method", "endpoint", "status"])
REQUEST_LATENCY = Histogram("api_request_duration_seconds", "Request latency")

app = FastAPI(title="BroadSpace API")

db_user = os.environ.get("DB_USER", "broadspace")
db_pass = os.environ.get("DB_PASSWORD", "change_me_in_production")
db_name = os.environ.get("DB_NAME", "broadspace")
db_host = os.environ.get("DB_HOST", "localhost")
db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:5432/{db_name}"
engine = create_engine(db_url)
Session = sessionmaker(bind=engine)


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
                   signal_strength, sentiment, sources, processed_at
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
            ))
        return results
    finally:
        session.close()


@app.get("/content/{content_id}", response_model=ContentResponse)
def get_content(content_id: str):
    session = Session()
    try:
        row = session.execute(
            text("""
                SELECT id, title, url, summary, categories, key_points,
                       signal_strength, sentiment, sources, processed_at
                FROM processed_articles WHERE id = :id
            """),
            {"id": content_id}
        ).fetchone()

        if not row:
            raise HTTPException(status_code=404, detail="Content not found")

        return ContentResponse(
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
        )
    finally:
        session.close()
