#!/usr/bin/env python3
"""Reclassify articles that have 'Other' category."""

import json
import os
import sys
from pathlib import Path

# Add processor to path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "processor" / "src"))

# Load .env before importing processor modules
from dotenv import load_dotenv
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from processor.llm.client import LLMClient
from processor.pipeline.classifier import Classifier, SYSTEM_PROMPT, CATEGORIES
from processor.models import RawArticle


def main():
    db_user = os.environ.get("DB_USER", "broadspace")
    db_pass = os.environ.get("DB_PASSWORD", "change_me_in_production")
    db_name = os.environ.get("DB_NAME", "broadspace")
    db_host = os.environ.get("DB_HOST", "localhost")
    db_url = f"postgresql://{db_user}:{db_pass}@{db_host}:5432/{db_name}"

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()

    llm = LLMClient()
    classifier = Classifier(llm)

    # Get all articles with "Other" category
    rows = session.execute(text("""
        SELECT id, title, summary
        FROM processed_articles
        WHERE categories::jsonb @> '"Other"'::jsonb
        ORDER BY processed_at DESC
    """)).fetchall()

    print(f"Found {len(rows)} articles with 'Other' category")

    success = 0
    failed = 0

    for row in rows:
        try:
            # Create a minimal RawArticle for classification
            article = RawArticle(
                id=row.id,
                title=row.title or "",
                url="",
                source_name="",
                content=row.summary or "",
                fetched_at="",
                hash=row.id,
            )

            # Get raw LLM response for debugging
            prompt = f"Title: {article.title}\nContent: {article.content[:2000]}\n\nClassify this article."
            raw_result = llm.chat_json(SYSTEM_PROMPT, prompt)
            raw_categories = raw_result.get("categories", [])
            valid = [c for c in raw_categories if c in CATEGORIES]
            categories = valid if valid else ["Other"]

            if categories == ["Other"] and raw_categories != ["Other"]:
                print(f"  {row.title[:50]:50s} RAW={raw_categories} -> Other")
            else:
                print(f"  {row.title[:50]:50s} -> {categories}")

            # Update the database
            session.execute(text("""
                UPDATE processed_articles
                SET categories = CAST(:categories AS jsonb)
                WHERE id = :id
            """), {"categories": json.dumps(categories), "id": row.id})
            session.commit()
            success += 1

        except Exception as e:
            print(f"  ERROR: {row.title[:60]} -> {e}")
            failed += 1

    print(f"\nDone: {success} reclassified, {failed} failed")
    session.close()


if __name__ == "__main__":
    main()
