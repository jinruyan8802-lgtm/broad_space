# Neo4j 知识图谱后端 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `TripleExtractor` 接入 pipeline，三元组同时存入 PostgreSQL 和 Neo4j；新增 `/graph/search` API；用图邻近度增强 `Ranker.expand`。

**Architecture:**
- `TripleExtractor` 修改为双语（EN+ZH）输出，在 `worker.py` 的 `_process_group()` 末尾调用，结果同时存入 `ProcessedContent.triples` 和 PostgreSQL
- `GraphitiClient` 在 Worker 初始化时创建，异步写入 Neo4j
- `Ranker` 持有同步封装的图查询引用，通过线程池计算 `expand`
- FastAPI 新增 `GET /graph/search` 和扩展 `ContentResponse` 模型

**Tech Stack:** Python, SQLAlchemy, graphiti_core, Neo4j, FastAPI, Pydantic

---

## 文件变更总览

| 文件 | 变更 |
|-----|------|
| `processor/src/processor/models.py` | 修改 `ProcessedContent.triples` 类型 `list[list[str]]` → `list[dict]` |
| `processor/src/processor/knowledge/extractor.py` | 改为双语输出（中英标签），支持中文内容 |
| `processor/src/processor/knowledge/graphiti_client.py` | 新增同步封装 `search_sync()`，新增 `add_triples_batch()` |
| `processor/src/processor/worker.py` | 初始化 `TripleExtractor` 和 `GraphitiClient`，在 `_process_group()` 调用三元组提取，Neo4j 写入 |
| `processor/src/processor/pipeline/ranker.py` | `Ranker` 增加 `graphiti_client` 引用，`score()` 增加图邻近度计算 |
| `api/models.py` | 新增 `TripleItem`、`GraphSearchResult`、`GraphSearchResponse` 模型 |
| `api/main.py` | 新增 `GET /graph/search` endpoint；扩展 `/content` SQL 查询返回 triples 列；启动时 ALTER TABLE 添加 triples 列 |

---

## Task 1: 修复 ProcessedContent.triples 类型

**文件：**
- Modify: `processor/src/processor/models.py:30`

**问题：** `ProcessedContent.triples` 声明为 `list[list[str]]`，但实际 extractor 输出是 `list[dict]`（各字段为字符串）。类型不匹配。

- [ ] **Step 1: 修改类型声明**

修改 `processor/src/processor/models.py` 第 30 行：

```python
# 修改前
triples: list[list[str]] = Field(default_factory=list)

# 修改后
triples: list[dict[str, str]] = Field(default_factory=list)
```

- [ ] **Step 2: 验证类型一致性**

检查所有引用 `ProcessedContent.triples` 的代码：
- `worker.py:209` — 传入 `ProcessedContent.triples` 到 `ProcessedArticle`，JSON 序列化无影响
- `extractor.py:23` — 返回 `list[dict]`，类型一致

- [ ] **Step 3: Commit**

```bash
git add processor/src/processor/models.py
git commit -m "fix: correct ProcessedContent.triples type from list[list[str]] to list[dict]"
```

---

## Task 2: 修改 TripleExtractor 输出中英双语

**文件：**
- Modify: `processor/src/processor/knowledge/extractor.py`

**目标：** LLM 输出同时包含中英文实体名和关系名。

- [ ] **Step 1: 编写失败测试**

创建 `processor/tests/unit/test_extractor.py`（如不存在则创建目录）：

```python
import pytest
from processor.knowledge.extractor import TripleExtractor
from processor.models import ProcessedContent

def _fake_llm():
    class FakeLLM:
        def chat_json(self, system, prompt):
            return {
                "triples": [
                    {
                        "subject": "PyTorch", "predicate": "drives", "object": "AI Research",
                        "subject_zh": "PyTorch", "predicate_zh": "驱动", "object_zh": "人工智能研究",
                        "confidence": "EXTRACTED"
                    }
                ]
            }
    return FakeLLM()

def test_extract_returns_bilingual_triples():
    extractor = TripleExtractor(_fake_llm())
    content = ProcessedContent(
        id="test1", title="PyTorch 2.0 released", summary="PyTorch drives AI research",
        key_points=["PyTorch 2.0"], categories=["AI/ML"], signal_strength=0.8
    )
    result = extractor.extract(content)
    assert len(result) == 1
    t = result[0]
    assert t["subject"] == "PyTorch"
    assert t["subject_zh"] == "PyTorch"
    assert t["predicate"] == "drives"
    assert t["predicate_zh"] == "驱动"
    assert t["confidence"] == "EXTRACTED"
```

运行：`pytest processor/tests/unit/test_extractor.py -v`
预期：FAIL（`subject_zh` 等字段在当前输出中不存在）

- [ ] **Step 2: 更新 SYSTEM_PROMPT 和 extract()**

将 `extractor.py` 的 `SYSTEM_PROMPT` 改为双语指令，`extract()` 方法添加中文标签映射：

```python
SYSTEM_PROMPT = """Extract knowledge triples from the tech news article (supports both English and Chinese content).

Entity types + Chinese equivalents:
- Technology → 技术, Event → 事件, Organization → 组织, Person → 人物
- Concept → 概念, Trend → 趋势, Paper → 论文

Relation types + Chinese equivalents:
- depends_on → 依赖于, drives → 驱动, competes_with → 竞争于
- created_by → 创建者, implements → 实现, evolves_from → 演进自
- replaces → 取代, published_in → 发布于, related_to → 相关于

Rules:
- Confidence: EXTRACTED (directly stated), INFERRED (reasonable inference), SPECULATIVE (weak signal)

Respond with JSON only:
{
    "triples": [
        {
            "subject": "...",
            "subject_zh": "...",
            "predicate": "...",
            "predicate_zh": "...",
            "object": "...",
            "object_zh": "...",
            "confidence": "EXTRACTED|INFERRED|SPECULATIVE"
        }
    ]
}"""

# 关系类型映射（英文 → 中文）
PREDICATE_ZH_MAP = {
    "depends_on": "依赖于",
    "drives": "驱动",
    "competes_with": "竞争于",
    "created_by": "创建者",
    "implements": "实现",
    "evolves_from": "演进自",
    "replaces": "取代",
    "published_in": "发布于",
    "related_to": "相关于",
}

# 实体类型映射（英文 → 中文）
ENTITY_ZH_MAP = {
    "Technology": "技术",
    "Event": "事件",
    "Organization": "组织",
    "Person": "人物",
    "Concept": "概念",
    "Trend": "趋势",
    "Paper": "论文",
}

def extract(self, content: ProcessedContent) -> list[dict]:
    prompt = f"Title: {content.title}\nSummary: {content.summary}\nKey points: {content.key_points}"
    try:
        result = self.llm.chat_json(SYSTEM_PROMPT, prompt)
        triples = result.get("triples", [])
        enriched = []
        for t in triples:
            t.setdefault("confidence", "EXTRACTED")
            # LLM 输出已带 _zh 字段则用 LLM 结果；否则做简单映射
            t.setdefault("subject_zh", ENTITY_ZH_MAP.get(t["subject"], t["subject"]))
            t.setdefault("predicate_zh", PREDICATE_ZH_MAP.get(t["predicate"], t["predicate"]))
            t.setdefault("object_zh", ENTITY_ZH_MAP.get(t["object"], t["object"]))
            enriched.append(t)
        return enriched
    except Exception:
        return []
```

- [ ] **Step 3: 运行测试验证**

运行：`pytest processor/tests/unit/test_extractor.py -v`
预期：PASS

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/knowledge/extractor.py processor/tests/unit/test_extractor.py
git commit -m "feat: bilingual triples (EN+ZH) in TripleExtractor"
```

---

## Task 3: GraphitiClient 同步封装 + 批量写入

**文件：**
- Modify: `processor/src/processor/knowledge/graphiti_client.py`

**目标：** 新增 `search_sync()`（同步版本）和 `add_triples_batch()`（批量写入）。

- [ ] **Step 1: 编写失败测试**

创建 `processor/tests/unit/test_graphiti_client.py`：

```python
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

def test_search_sync_returns_list():
    with patch("processor.knowledge.graphiti_client.GRAPHTI_AVAILABLE", True):
        from processor.knowledge.graphiti_client import GraphitiClient
        client = GraphitiClient(uri="bolt://localhost:7687", user="neo4j", password="broad")
        # Mock the async search via threading
        with patch.object(client, "search", new=AsyncMock(return_value=[
            MagicMock(text="PyTorch drives AI", score=0.95)
        ])):
            result = client.search_sync("AI")
            assert isinstance(result, list)
```

运行：FAIL（`search_sync` 方法不存在）

- [ ] **Step 2: 添加同步封装方法**

在 `GraphitiClient` 类中添加：

```python
import asyncio

def search_sync(self, query: str, limit: int = 10) -> list[dict[str, Any]]:
    """Synchronous wrapper for async search()."""
    if not self.client:
        return []
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(self.search(query, limit))
    finally:
        loop.close()

def add_triples_batch(self, content_id: str, triples: list[dict]) -> bool:
    """Synchronous wrapper for async add_triples()."""
    if not self.client:
        return False
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(self.add_triples(content_id, triples))
    finally:
        loop.close()
```

- [ ] **Step 3: 运行测试验证**

运行：`pytest processor/tests/unit/test_graphiti_client.py -v`
预期：PASS

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/knowledge/graphiti_client.py processor/tests/unit/test_graphiti_client.py
git commit -m "feat: add search_sync() and add_triples_batch() to GraphitiClient"
```

---

## Task 4: Worker 集成 TripleExtractor 和 GraphitiClient

**文件：**
- Modify: `processor/src/processor/worker.py`

**目标：** 在 Worker 初始化时创建 `TripleExtractor` 和 `GraphitiClient`；`_process_group()` 末尾调用三元组提取；`_save()` 后写入 Neo4j。

- [ ] **Step 1: 修改 Worker.__init__()**

在 `__init__()` 方法中新增导入和初始化：

```python
from processor.knowledge.extractor import TripleExtractor
from processor.knowledge.graphiti_client import GraphitiClient

def __init__(self, ...):
    ...
    self.knowledge_extractor = TripleExtractor(llm)
    self.graphiti_client = GraphitiClient()
    logger.info("Knowledge extractor and Graphiti client initialized")
```

- [ ] **Step 2: 修改 _process_group()**

在 `_process_group()` 返回 `ProcessedContent` 之前（约第 182-194 行 return 语句处），新增三元组提取：

```python
# 在 return ProcessedContent(...) 之前新增：
t0_triples = time.perf_counter()
triples = self.knowledge_extractor.extract(
    ProcessedContent(
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
)
t1_triples = time.perf_counter()
logger.info("Triple extraction for %s: count=%d duration_ms=%.1f",
           primary.hash, len(triples), (t1_triples - t0_triples) * 1000)
```

然后将 `triples=triples` 替换到 return 语句的 `ProcessedContent(...)` 中：

```python
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
    triples=triples,  # 替换掉原来的 triples=[]
)
```

- [ ] **Step 3: 修改 _save()**

在 `_save()` 方法 `session.commit()` 之后（约第 213 行），新增 Neo4j 写入：

```python
# 写入 Neo4j（图谱）
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
```

- [ ] **Step 4: 验证**

```bash
# 语法检查
python -m py_compile processor/src/processor/worker.py
```

- [ ] **Step 5: Commit**

```bash
git add processor/src/processor/worker.py
git commit -m "feat: integrate TripleExtractor and GraphitiClient in worker pipeline"
```

---

## Task 5: Ranker 增加图邻近度 expand 计算

**文件：**
- Modify: `processor/src/processor/pipeline/ranker.py`

**目标：** `Ranker` 持有 `GraphitiClient` 引用，`score()` 通过 `search_sync()` 查询图邻近度，计算 `expand`。

- [ ] **Step 1: 编写失败测试**

创建 `processor/tests/unit/test_ranker.py`：

```python
import pytest
from unittest.mock import patch, MagicMock
from processor.pipeline.ranker import Ranker
from processor.models import ProcessedContent

def test_score_expand_uses_graph_proximity():
    with patch("processor.knowledge.graphiti_client.GRAPHTI_AVAILABLE", True):
        from processor.knowledge.graphiti_client import GraphitiClient

        mock_client = MagicMock(spec=GraphitiClient)
        mock_client.search_sync.return_value = [
            {"text": "PyTorch drives AI", "score": 0.9},
            {"text": "PyTorch competes with JAX", "score": 0.85},
        ]

        ranker = Ranker(user_categories=["AI/ML"], graphiti_client=mock_client)
        content = ProcessedContent(
            id="test1", title="PyTorch 2.0 released",
            summary="PyTorch drives AI research", key_points=["PyTorch"],
            categories=["AI/ML"], signal_strength=0.8
        )
        scores = ranker.score(content)
        assert scores["expand"] > 0.3, f"Expected expand > 0.3, got {scores['expand']}"
        assert mock_client.search_sync.called
```

运行：FAIL（`Ranker` 构造函数尚未接受 `graphiti_client` 参数）

- [ ] **Step 2: 修改 Ranker**

修改 `processor/src/processor/pipeline/ranker.py`：

```python
from typing import Any
from processor.knowledge.graphiti_client import GraphitiClient

class Ranker:
    def __init__(
        self,
        user_categories: list[str] | None = None,
        graphiti_client: GraphitiClient | None = None,
    ):
        self.user_categories = set(user_categories or ["AI/ML", "Infrastructure"])
        self._seen_categories: set[str] = set()
        self.graphiti_client = graphiti_client

    def score(self, content: ProcessedContent) -> dict[str, float]:
        # Exploit
        cat_overlap = len(set(content.categories) & self.user_categories)
        exploit = min(cat_overlap / max(len(self.user_categories), 1), 1.0) * content.signal_strength

        # Expand: graph proximity
        expand = self._compute_graph_proximity(content)

        # Explore (unchanged)
        novel = len(set(content.categories) - self._seen_categories)
        explore = (novel / max(len(DEFAULT_CATEGORIES), 1)) * content.signal_strength
        self._seen_categories.update(content.categories)

        return {"exploit": exploit, "expand": expand, "explore": explore}

    def _compute_graph_proximity(self, content: ProcessedContent) -> float:
        """Compute graph-based expand score via Neo4j search_sync()."""
        if not self.graphiti_client:
            return 0.3

        try:
            results = self.graphiti_client.search_sync(content.title, limit=5)
            if not results:
                return 0.3
            # Normalize: avg score of top results, scaled to [0, 0.5]
            avg_score = sum(r["score"] for r in results) / len(results)
            return min(avg_score * 0.5, 1.0)
        except Exception:
            return 0.3
```

- [ ] **Step 3: 运行测试验证**

运行：`pytest processor/tests/unit/test_ranker.py -v`
预期：PASS

- [ ] **Step 4: Commit**

```bash
git add processor/src/processor/pipeline/ranker.py processor/tests/unit/test_ranker.py
git commit -m "feat: Ranker uses GraphitiClient for expand graph proximity scoring"
```

---

## Task 6: API 数据模型扩展 + triples 列迁移

**文件：**
- Modify: `api/models.py`
- Modify: `api/main.py`

- [ ] **Step 1: 扩展 api/models.py**

```python
from pydantic import BaseModel
from datetime import datetime

class TripleItem(BaseModel):
    subject: str
    subject_zh: str
    predicate: str
    predicate_zh: str
    object: str
    object_zh: str
    confidence: str  # EXTRACTED | INFERRED | SPECULATIVE

# ContentResponse 扩展：新增 triples 字段（保持其他字段不变）
class ContentResponse(BaseModel):
    id: str
    title: str
    url: str
    summary: str
    categories: list[str]
    key_points: list[str]
    signal_strength: float
    sentiment: str
    sources: list[dict[str, str]]
    processed_at: datetime
    triples: list[TripleItem] = []  # 新增字段

class GraphSearchResult(BaseModel):
    text: str
    score: float
    entities: list[str]
    entity_names_zh: list[str]

class GraphSearchResponse(BaseModel):
    query: str
    results: list[GraphSearchResult]
```

- [ ] **Step 2: 修改 api/main.py**

**A. 启动时 ALTER TABLE（确保 triples 列存在）：**

在 `app = FastAPI(...)` 之后、`@app.get("/health")` 之前添加：

```python
@app.on_event("startup")
async def ensure_triples_column():
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
```

**B. 修改 `GET /content` 的 SQL 查询：**

在 `SELECT` 语句中添加 `triples` 列：

```sql
SELECT id, title, url, summary, categories, key_points,
       signal_strength, sentiment, sources, processed_at, triples
FROM processed_articles
WHERE signal_strength >= :min_signal
```

映射到 `ContentResponse`（在 for 循环中）：

```python
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
    ))
```

**C. 类似地修改 `GET /content/{content_id}` 的映射。**

- [ ] **Step 3: Commit**

```bash
git add api/models.py api/main.py
git commit -m "feat: extend ContentResponse with triples, add ALTER TABLE on startup"
```

---

## Task 7: 新增 GET /graph/search API Endpoint

**文件：**
- Modify: `api/main.py`

- [ ] **Step 1: 导入 GraphitiClient**

在 `api/main.py` 顶部 import 区添加：

```python
import os
import asyncio
from concurrent.futures import ThreadPoolExecutor

from processor.knowledge.graphiti_client import GraphitiClient
```

- [ ] **Step 2: 添加 ThreadPoolExecutor 和 GraphitiClient 实例**

在 `app` 创建后（文件顶部级别）添加：

```python
_executor = ThreadPoolExecutor(max_workers=4)
_graphiti_client = GraphitiClient(
    uri=os.environ.get("NEO4J_URI", "bolt://localhost:7687"),
    user=os.environ.get("NEO4J_USER", "neo4j"),
    password=os.environ.get("NEO4J_PASSWORD", "broadspace"),
)
```

- [ ] **Step 3: 添加 /graph/search endpoint**

在 `api/main.py` 末尾添加：

```python
@app.get("/graph/search", response_model=GraphSearchResponse)
def graph_search(
    query: str = Query(..., description="Natural language query"),
    limit: int = Query(10, ge=1, le=50),
):
    """
    Search the knowledge graph via Neo4j.

    Returns matching triples with bilingual entity/relation labels.
    """
    try:
        loop = asyncio.new_event_loop()
        try:
            raw_results = loop.run_until_complete(
                _graphiti_client.search(query, limit=limit)
            )
        finally:
            loop.close()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Graph search failed: {e}")

    results: list[GraphSearchResult] = []
    for r in raw_results:
        text = r.get("text", "")
        # 当前 Graphiti search 返回文本片段不含结构化实体列表
        # Entity extraction from text is TODO Phase 3.5
        results.append(GraphSearchResult(
            text=text,
            score=r.get("score", 0.0),
            entities=[],
            entity_names_zh=[],
        ))

    return GraphSearchResponse(query=query, results=results)
```

> **简化说明：** `GraphitiClient.search()` 返回的结果是文本片段，不含结构化实体列表。Entity 列表和中文名暂为空列表，TODO 在 Phase 3.5 完成（`add_triples` 时将实体名索引到单独存储）。

- [ ] **Step 4: 验证 CORS**

已有 CORSMiddleware 允许 `http://localhost:3000`，确认无需额外修改。

- [ ] **Step 5: Commit**

```bash
git add api/main.py
git commit -m "feat: add GET /graph/search endpoint with Neo4j search"
```

---

## Task 8: 前端 feed-server.js /graph 路由改造

**文件：**
- Modify: `web/feed-server.js`

**目标：** `/graph` 页面从 `API + "/content?limit=100"`（假图）改为 `API + "/graph/search?query=AI&limit=50"`（真图）。

- [ ] **Step 1: 更新 GRAPH_HTML 中的 load() 函数**

找到 `GRAPH_HTML` 中的 `async function load()`，改为：

```javascript
async function load() {
  try {
    var resp = await fetch(API + "/graph/search?query=" + encodeURIComponent("AI") + "&limit=50");
    if (!resp.ok) throw new Error("API error: " + resp.status);
    var data = await resp.json();

    if (!data.results || data.results.length === 0) {
      document.getElementById("status").textContent = "No graph data yet. Process some articles first.";
      return;
    }

    var nodes_map = {};
    var links = [];

    data.results.forEach(function(r) {
      // 从文本中提取英文词作为伪实体（简化方案）
      var words = r.text.split(/[\s,.()]+/).filter(function(w) {
        return w.length > 3 && w.match(/^[A-Z][a-z]/) && !["The","This","That","From","With"].includes(w);
      });

      var centerId = "result_" + Math.random().toString(36).substr(2, 6);
      nodes_map[centerId] = {
        id: centerId,
        title: r.text.substring(0, 50),
        group: "Concept",
        signal: r.score || 0,
        summary: r.text
      };

      words.slice(0, 5).forEach(function(word) {
        if (!nodes_map[word]) {
          nodes_map[word] = { id: word, title: word, group: "Technology", signal: 0.5, summary: "" };
        }
        links.push({ source: centerId, target: word, value: 1 });
      });
    });

    var nodes = Object.values(nodes_map);
    links = links.slice(0, Math.min(links.length, nodes.length * 3));

    render(nodes, links);
    document.getElementById("status").textContent = nodes.length + " articles, " + links.length + " connections";
  } catch(e) {
    document.getElementById("status").textContent = "Error: " + e.message;
  }
}
```

- [ ] **Step 2: 验证**

```bash
# 重启 feed-server.js
cd /home/jinru/workon/broad_space/web
kill $(lsof -t -i:3000) 2>/dev/null; node feed-server.js &

# 测试 /graph/search API
curl -s "http://localhost:8000/graph/search?query=AI&limit=5"
```

- [ ] **Step 3: Commit**

```bash
git add web/feed-server.js
git commit -m "feat: feed-server /graph fetches from /graph/search API (real knowledge graph)"
```

---

## Task 9: 端到端集成验证

- [ ] **Step 1: 清理历史数据**

```bash
docker compose exec postgres psql -U broadspace -d broadspace -c "DELETE FROM processed_articles;"
```

- [ ] **Step 2: 重启 API**

```bash
docker compose restart api
```

- [ ] **Step 3: 验证 triples 列迁移**

```bash
docker compose exec postgres psql -U broadspace -d broadspace -c \
  "SELECT column_name FROM information_schema.columns WHERE table_name='processed_articles' AND column_name='triples';"
```

- [ ] **Step 4: 验证 API 响应**

```bash
curl -s "http://localhost:8000/content?limit=3" | python -m json.tool | grep triples
curl -s "http://localhost:8000/graph/search?query=AI&limit=3"
```

- [ ] **Step 5: Playwright 验证前端**

```bash
python /tmp/test_final.py
# 确认 /graph 页面无 "Error: Failed to fetch"
```

- [ ] **Step 6: Commit 最终状态**

```bash
git add -A && git commit -m "feat: complete Neo4j knowledge graph pipeline (sub-project A)"
```

---

## 自检清单

- [ ] **Spec 覆盖检查：** 每个 PRD Section 都能找到对应的 Task
  - 3.3 数据结构（中英双语） → Task 2
  - 5.1 PostgreSQL triples 列 → Task 6
  - 5.2 ContentResponse 扩展 → Task 6
  - 5.3 GraphSearchResponse → Task 6
  - 6.1 /graph/search API → Task 7
  - 7.1 worker.py 调用 TripleExtractor → Task 4
  - 7.2 Neo4j 写入 → Task 4
  - 7.2 Ranker expand → Task 5
  - 8.1 前端 /graph → Task 8
- [ ] **占位符扫描：** 无 "TBD"、"TODO（未填写）"、"类似 Task N" 等占位符
- [ ] **类型一致性：** `ProcessedContent.triples` 类型修改已传递到所有消费点（Task 1）
- [ ] **API Task 6-7 无循环依赖：** API models → main.py endpoint，先改 models 再加 endpoint