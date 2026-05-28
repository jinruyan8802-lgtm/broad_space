from sqlalchemy import Column, String, Float, DateTime, JSON
from sqlalchemy.orm import declarative_base
from datetime import datetime

Base = declarative_base()

class ProcessedArticle(Base):
    __tablename__ = "processed_articles"

    id = Column(String, primary_key=True)
    title = Column(String, nullable=False)
    url = Column(String, nullable=False)
    summary = Column(String)
    categories = Column(JSON)
    key_points = Column(JSON)
    signal_strength = Column(Float)
    sentiment = Column(String)
    cross_source_analysis = Column(JSON)
    triples = Column(JSON)
    sources = Column(JSON)
    processed_at = Column(DateTime, default=datetime.utcnow)
    language = Column(String, default="en")
    title_zh = Column(String, default="")
    summary_zh = Column(String, default="")
    key_points_zh = Column(JSON, default=list)