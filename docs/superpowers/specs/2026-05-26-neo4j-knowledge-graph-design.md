# PRD: Neo4j 知识图谱后端 + 排序增强

**项目:** BroadSpace 子项目 A — Neo4j 知识图谱 + 排序增强
**日期:** 2026/05/26
**状态:** 设计中

---

## 1. 背景与问题

当前 pipeline 存在严重的"断路"问题：`TripleExtractor` 和 `GraphitiClient` 虽然已定义，但从未被调用，导致：

- `ProcessedContent.triples` 始终为空数组
- `GraphitiClient.add_triples()` 从未被执行
- `Ranker.expand` 硬编码为 0.3，无真实图数据支撑
- 前端 `/graph` 页面只能基于分类共现构建假图，而非真实知识图谱

此外，已抽取的三元组既没有存入 Neo4j，也没有通过 API 对外暴露。

---

## 2. 目标

1. **打通三元组提取流程** — 文章经 `TripleExtractor.extract()` 提取三元组后，同时存入 PostgreSQL（与文章记录同行）和 Neo4j（图数据库）
2. **提供图搜索 API** — 新增 `GET /graph/search` 接口，以自然语言查询 Neo4j 中的知识图谱
3. **增强排序信号** — 用图数据计算 `Ranker.expand` 分数，替代硬编码的 0.3 常量
4. **支持中英双语标签** — 实体和关系同时以中英文标签存储，API 返回时附上中文别名

---

## 3. 中英双语标签设计

### 3.1 实体类型映射

| 英文标签 | 中文标签 |
|---------|---------|
| Technology | 技术 |
| Event | 事件 |
| Organization | 组织 |
| Person | 人物 |
| Concept | 概念 |
| Trend | 趋势 |
| Paper | 论文 |

### 3.2 关系类型映射

| 英文标签 | 中文标签 |
|---------|---------|
| depends_on | 依赖于 |
| drives | 驱动 |
| competes_with | 竞争于 |
| created_by | 创建者 |
| implements | 实现 |
| evolves_from | 演进自 |
| replaces | 取代 |
| published_in | 发布于 |
| related_to | 相关于 |

### 3.3 数据结构

每条三元组同时包含中英文标签：

```json
{
  "subject": "Rust",
  "subject_zh": "Rust",
  "predicate": "drives",
  "predicate_zh": "驱动",
  "object": "ML",
  "object_zh": "机器学习",
  "confidence": "EXTRACTED"
}
```

实体节点以英文名为 Neo4j 主键，`name_zh` 作为属性存储中文名。

---

## 4. 系统架构

```
文章处理流程:
  _process_group()
    → TripleExtractor.extract(content)
      → 提取中英双语三元组
      → 存入 ProcessedContent.triples
      → 存入 PostgreSQL processed_articles.triples
      → await GraphitiClient.add_triples(content_id, triples)
        → Neo4j EntityEdge 写入

图查询流程:
  GET /graph/search?query=...&limit=10
    → GraphitiClient.search(query)
    → 返回 [{text, score, entities, relations}]
    → 附上中文标签

排序流程:
  rank(contents)
    → 计算 exploit (分类重叠)
    → 计算 expand (图邻近度，从 Neo4j 查询得到)
    → 计算 explore (新颖性)
    → weighted sort
```

---

## 5. 数据模型变更

### 5.1 PostgreSQL — `processed_articles` 表

新增列（通过 ALTER TABLE 添加）：

| 列名 | 类型 | 说明 |
|-----|------|------|
| `triples` | JSONB | 存储三元组数组 |

如 `triples` 列已存在则跳过创建。

### 5.2 API Response — `ContentResponse`

扩展 `ContentResponse` 模型，新增字段：

```python
class ContentResponse(BaseModel):
    ...
    triples: list[TripleItem] = []

class TripleItem(BaseModel):
    subject: str
    subject_zh: str
    predicate: str
    predicate_zh: str
    object: str
    object_zh: str
    confidence: str  # EXTRACTED | INFERRED | SPECULATIVE
```

### 5.3 新 API Response — `GraphSearchResponse`

```python
class GraphSearchResult(BaseModel):
    text: str          # 匹配片段描述
    score: float       # 相似度分数
    entities: list[str]  # 匹配的英文实体名列表
    entity_names_zh: list[str]  # 中文别名列表

class GraphSearchResponse(BaseModel):
    query: str
    results: list[GraphSearchResult]
```

---

## 6. API 接口

### 6.1 `GET /graph/search`

**参数：**

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|--------|------|
| `query` | string (必需) | — | 自然语言查询 |
| `limit` | int | 10 | 最大返回条数 (1-50) |

**响应示例：**

```json
{
  "query": "机器学习框架",
  "results": [
    {
      "text": "PyTorch 是由 Facebook 开发的深度学习框架，驱动 AI 研究",
      "score": 0.94,
      "entities": ["PyTorch", "Facebook", "AI"],
      "entity_names_zh": ["PyTorch", "Facebook", "人工智能"]
    }
  ]
}
```

**CORS：** 同主 API（`*`）

### 6.2 `GET /content/{id}` 和 `GET /content` 扩展

两个已有 endpoint 在响应中新增 `triples` 字段（可能为空数组）。

---

## 7. Pipeline 改造

### 7.1 `worker.py` 改动

位置：`processor/src/processor/worker.py`，`_process_group()` 方法

**改动 1：调用 TripleExtractor**

在 `_process_group()` 返回 `ProcessedContent` 之前，新增：

```python
# 在 categories, summary 等字段已填充之后
triples = knowledge_extractor.extract(content)  # content 此时已有 title/summary/key_points
content = content.model_copy(update={"triples": triples})
```

其中 `knowledge_extractor` 是 `TripleExtractor` 实例，在 Worker 初始化时创建。

**改动 2：写入 Neo4j**

在 `_save()` 方法（`_save_content_to_db` 调用）之后，新增：

```python
if graphiti_client and triples:
    try:
        await graphiti_client.add_triples(content.id, triples)
    except Exception as e:
        logger.warning(f"Failed to add triples to Neo4j for {content.id}: {e}")
```

### 7.2 Ranker 增强

位置：`processor/src/processor/pipeline/ranker.py`

将 `expand` 从硬编码 `0.3` 改为真实图邻近度分数：

```python
async def score_async(self, content: ProcessedContent) -> dict[str, float]:
    # exploit (不变)
    cat_overlap = len(set(content.categories) & self.user_categories)
    exploit = min(cat_overlap / max(len(self.user_categories), 1), 1.0) * content.signal_strength

    # expand: 从 Neo4j 图邻近度计算
    expand = await self._compute_graph_proximity(content)

    # explore (不变)
    novel = len(set(content.categories) - self._seen_categories)
    explore = (novel / max(len(DEFAULT_CATEGORIES), 1)) * content.signal_strength
    self._seen_categories.update(content.categories)

    return {"exploit": exploit, "expand": expand, "explore": explore}
```

图邻近度计算方式：查询文章标题中的实体节点在 Neo4j 中的邻居节点数量，归一化到 [0, 1]。

**实现方式 B（采用）：** `expand` 计算使用简化的同步图邻近度。`Ranker` 持有 `GraphitiClient` 引用（同步封装），通过线程池调用 `graphiti_client.search()` 获取邻居实体数，绕过异步改造。保持 `Ranker.score()` 同步接口。

**TODO（Phase 2.5 完成后）：** Ranker 异步化重构 — 将 `score()` 改为 `async score_async()`，在 Worker 的异步上下文中调用真实 Neo4j 图邻近度查询。

---

## 8. 前端 /graph 页面改造

### 8.1 feed-server.js `/graph` 路由

改造 `/graph` 页面，从 `API + "/content?limit=100"`（假图）改为 `API + "/graph/search?query=AI&limit=50"`（真图）。

**节点构建：**
- 从 `/graph/search?query=` 结果的 `entities` 字段提取所有唯一实体作为节点
- 从 `results[].text` 中提取三元组关系作为链接

**交互元素：**
- 节点颜色按实体类型（Technology=red, Concept=blue, Organization=green, Person=purple, Event=orange）
- 节点大小按 `score` 缩放
- Hover 显示中文别名 (`entity_names_zh`) 和 `text` 片段
- 支持 `/graph?query=XXX` URL 参数初始查询

### 8.2 Next.js `/graph` 页面（子项目 B 的工作）

子项目 B 时再处理，本次不涉及。

---

## 9. 错误处理

| 场景 | 处理方式 |
|-----|---------|
| TripleExtractor LLM 调用失败 | 降级：设置 `triples=[]`，记录 warning log，不阻塞文章处理 |
| Neo4j `add_triples` 失败 | 仅记录 warning，不影响主流程（graceful degradation） |
| Graphiti 未安装（`GRAPHTI_AVAILABLE=False`） | 跳过图写入，图搜索返回 404 并提示功能不可用 |
| `/graph/search` Neo4j 查询失败 | 返回 500 + 错误消息，不返回假数据 |
| Ranker 图邻近度计算超时 | 超时 2s 降级为 0.3，不阻塞排序 |

---

## 10. 验收标准

### 10.1 三元组提取与存储

- [ ] `worker.py` 处理一篇包含技术主题的文章后，`processed_articles.triples` 列包含有效 JSON 数组（非空）
- [ ] Neo4j 中可查询到对应的 EntityEdge 记录（通过 `match (n)-[r]->(m) return n,r,m` 验证）

### 10.2 API 端点

- [ ] `GET /graph/search?query=AI` 返回包含 `results[].entities` 和 `entity_names_zh` 的有效响应
- [ ] `GET /content/{id}` 响应的 `triples` 字段格式正确（中英双语）
- [ ] CORS 正确（OPTIONS 预检返回允许 `http://localhost:3000`）

### 10.3 排序增强

- [ ] `Ranker.score()` 在有图数据时返回的 `expand` 值 > 0.3（验证真实图计算）
- [ ] 无图数据时 `expand` 降级为 0.3（向后兼容）

### 10.4 前端

- [ ] `feed-server.js` 的 `/graph` 页面成功渲染来自 `/graph/search` 的真实数据节点和链接
- [ ] 节点 hover 显示中文别名

---

## 11. 依赖与约束

- **LLM Base URL:** `http://localhost:1234/v1`（LM Studio 本地），需兼容 `/v1/chat/completions`
- **Neo4j:** `bolt://localhost:7687`，已有 APOC 插件
- **PostgreSQL:** 已有 `processed_articles` 表，需 ALTER TABLE 添加 `triples` 列
- **并发：** Worker 对每篇文章单独调用 `TripleExtractor`，Neo4j 写入异步，不阻塞主流程
- **注意：** 由于历史数据（现有的 `processed_articles` 记录）可全部清空，本次不执行复杂迁移。新增 `triples` 列默认值 `[]`，历史文章三元组留空，后续文章逐步积累。

**TODO（数据成熟后）：** 补充历史数据的图谱回填脚本 — 将已有文章标题通过 `TripleExtractor` 重新提取三元组并写入 Neo4j。

---

## 12. 非目标（本次）

- 不实现 `/graph/stats` 等分析类接口
- 不修改 `feed-server.js` 以外的任何前端代码（Next.js graph 页面在子项目 B 处理）
- 不实现邮件或 WeCom 通知（子项目 C/D）