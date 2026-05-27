#!/usr/bin/env python3
"""Backfill Neo4j with triples from PostgreSQL processed_articles table."""

import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "processor", "src"))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from processor.knowledge.graphiti_client import GraphitiClient


def main():
    db_user = os.environ.get("DB_USER", "broadspace")
    db_pass = os.environ.get("DB_PASSWORD", "broadspace")
    db_name = os.environ.get("DB_NAME", "broadspace")
    db_host = os.environ.get("DB_HOST", "localhost")
    db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:5432/{db_name}"

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    client = GraphitiClient()

    rows = session.execute(
        text("SELECT id, triples FROM processed_articles WHERE triples IS NOT NULL")
    ).fetchall()

    total_triples = 0
    for row in rows:
        raw = row.triples
        if not raw:
            continue
        triples = raw if isinstance(raw, list) else json.loads(raw)
        if not triples:
            continue
        ok = client.add_triples(row.id, triples)
        count = len(triples)
        total_triples += count
        status = "ok" if ok else "FAILED"
        print(f"  {row.id[:16]}... {count} triples -> {status}")

    session.close()
    if client._driver:
        client._driver.close()
    print(f"\nDone. Backfilled {total_triples} triples from {len(rows)} articles.")


if __name__ == "__main__":
    main()
