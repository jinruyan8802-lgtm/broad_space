#!/usr/bin/env python3
"""Backfill entity_type on existing Neo4j nodes using heuristic classification."""

import os
import sys
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "processor", "src"))

from neo4j import GraphDatabase


TECH_KEYWORDS = {
    "python", "rust", "javascript", "typescript", "golang", "java", "c++", "swift",
    "kotlin", "react", "vue", "angular", "nextjs", "svelte", "node", "deno", "bun",
    "docker", "kubernetes", "k8s", "terraform", "aws", "azure", "gcp", "linux",
    "redis", "postgres", "mysql", "mongodb", "neo4j", "elasticsearch",
    "tensorflow", "pytorch", "llm", "gpt", "claude", "gemini", "openai",
    "api", "sdk", "cli", "gui", "ui", "css", "html", "sql", "graphql", "rest",
    "grpc", "websocket", "http", "tcp", "udp", "区块链", "微服务", "容器",
    "machine learning", "deep learning", "neural", "transformer", "diffusion",
    "framework", "library", "compiler", "runtime", "kernel", "driver", "firmware",
}

ORG_SUFFIXES = {
    "inc", "corp", "ltd", "llc", "co", "company", "labs", "lab", "research",
    "institute", "foundation", "university", "group", "team", "联盟", "研究院",
}

PERSON_TITLES = {
    "dr", "prof", "professor", "ceo", "cto", "cfo", "vp", "director",
    "engineer", "researcher", "developer", "founder", "创始人", "博士", "教授",
}

EVENT_KEYWORDS = {
    "release", "launch", "announcement", "conference", "summit", "event",
    "发布", "发布", "会议", "峰会", "事故", "事件", "outage", "incident",
}


def classify_entity(name: str) -> str:
    lower = name.lower().strip()

    # Person: short name with title, or "First Last" pattern
    for title in PERSON_TITLES:
        if lower.startswith(title + " ") or lower.startswith(title + "."):
            return "Person"
    if re.match(r"^[A-Z][a-z]+ [A-Z][a-z]+$", name) and len(name.split()) == 2:
        return "Person"

    # Organization: suffixes
    for suffix in ORG_SUFFIXES:
        if lower.endswith(" " + suffix) or lower.endswith(suffix):
            return "Organization"

    # Technology: keywords
    for kw in TECH_KEYWORDS:
        if kw in lower:
            return "Technology"

    # Event: keywords
    for kw in EVENT_KEYWORDS:
        if kw in lower:
            return "Event"

    # Default
    return "Concept"


def main():
    uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")
    user = os.environ.get("NEO4J_USER", "neo4j")
    password = os.environ.get("NEO4J_PASSWORD", "broadspace")

    driver = GraphDatabase.driver(uri, auth=(user, password))

    with driver.session() as session:
        result = session.run("MATCH (n:Entity) WHERE n.entity_type IS NULL RETURN n.name AS name")
        nodes = [{"name": r["name"]} for r in result]

    print(f"Found {len(nodes)} nodes without entity_type")

    updated = 0
    with driver.session() as session:
        for node in nodes:
            etype = classify_entity(node["name"])
            session.run(
                "MATCH (n:Entity {name: $name}) SET n.entity_type = $etype",
                name=node["name"],
                etype=etype,
            )
            updated += 1

    driver.close()
    print(f"Updated {updated} nodes with entity_type")

    # Show distribution
    driver2 = GraphDatabase.driver(uri, auth=(user, password))
    with driver2.session() as session:
        result = session.run(
            "MATCH (n:Entity) RETURN n.entity_type AS type, count(*) AS cnt ORDER BY cnt DESC"
        )
        print("\nEntity type distribution:")
        for r in result:
            print(f"  {r['type']}: {r['cnt']}")
    driver2.close()


if __name__ == "__main__":
    main()
