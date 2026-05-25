# BroadSpace 技术视野拓展工具 — 设计文档

## 概述

BroadSpace 是一个帮助软件工程师破除信息茧房、拓展技术知识面的日常工具。核心功能：每日多渠道推送精选日报 + Web 交互式知识探索，基于 AI 深度分析和时间感知知识图谱，发现最新技术发展、热点和即将发生的范式变化。

## 用户需求摘要

- **信息来源**：综合技术新闻 + 开发者社区 + 学术前沿，全量覆盖（中文+英文）
- **推荐机制**：可调节滑块，控制探索/利用比例，支持快速预设
- **分发方式**：Email 日报 + 企业微信 Bot 推送 + Web 探索界面
- **AI 加工深度**：跨源模式识别、趋势判断、矛盾观点对比、范式变化预测
- **知识积累**：时间感知知识图谱，追踪技术演进脉络和概念关系

## 方案选择

选择**模块化组装方案**：各层选最佳开源组件，通过统一数据总线串联，每层可独立替换。

- 采集层：Go 服务 (高性能并发) + Miniflux (RSS 管理) + News Llama (源发现)
- 处理层：Python 自建 LLM Pipeline (核心价值集中于此)
- 知识层：Graphiti (时间感知知识图谱) + Neo4j/FalkorDB
- 分发层：Next.js Web UI + Email + 企业微信 Bot

## 系统架构

```
采集层 (Go)          处理层 (Python)        知识层 (Graphiti)      分发层
─────────           ──────────            ──────────           ──────
Miniflux ─┐                                           ┌── Email 日报
Custom    ├→ 归一化 → Redis Streams → 去重 → 分类    │
Scraper   │                           摘要 → 分析 → KG → Web 探索 UI
GitHub    │                           排序            │
ArXiv    ─┘                                           └── 企业微信 Bot
```

### 容器拓扑

| 容器 | 技术栈 | 职责 |
|------|--------|------|
| Go Collector | Go | 并发采集 200+ 源 → 归一化 → Redis Streams |
| Python Processor | Python | 消费 → 去重 → LLM 分类/摘要/分析 → 排序 |
| Graphiti + Neo4j | Python + Neo4j | 时间感知知识图谱 + 混合检索 |
| Web UI | Next.js + D3.js | 交互式知识探索界面 |
| Email Service | Python | SMTP 定时推送 HTML 日报 |
| WeCom Bot | Python | 企业微信 Webhook 推送 |

**共享基础设施**：PostgreSQL (内容存储+全文搜索)、Redis (消息队列+缓存)、Miniflux (RSS 管理)、Neo4j (图谱存储)

## 数据流

1. **定时触发** — Cron 调度器每 30 分钟触发一轮采集
2. **Go 采集** — 并发拉取 RSS、HN、Reddit、知乎、V2EX、GitHub Trending、ArXiv
3. **归一化** — Go 格式化为统一 JSON 结构 → 推入 Redis Streams
4. **去重** — Python 消费 → 语义嵌入 → 聚类合并 (≥85% 相似度视为同一事件)
5. **分类+摘要** — LLM 多标签分类 → 结构化摘要 (1句话概括 + 3要点 + 信号强度评分)
6. **深度分析** — 跨源对比 (观点分歧/共识) → 关联历史 → 趋势判断 → 范式信号检测
7. **图谱更新** — 抽取三元组 → Graphiti 时间窗口写入 → Neo4j
8. **分发** — Email (8:00 HTML 日报) + 企业微信 (8:00/18:00) + Web UI (实时可查)

### 统一数据格式

```json
{
  "id": "evt_20260525_001",
  "sources": [
    {"name": "HN", "url": "...", "fetched_at": "..."},
    {"name": "机器之心", "url": "...", "fetched_at": "..."}
  ],
  "canonical_url": "most_representative_or_original_url",
  "title": "...",
  "summary": "...",
  "key_points": ["...", "..."],
  "categories": ["AI/ML", "Open Source"],
  "signal_strength": 0.88,
  "sentiment": "cautiously_optimistic",
  "cross_source_analysis": {
    "consensus": "...",
    "divergence": "...",
    "related_trends": ["..."]
  },
  "triples": [
    ["subject", "predicate", "object"]
  ]
}
```

### 关键约束

- Go 并发控制：goroutine pool，最多 50 并发请求
- LLM 成本控制：先轻量去重+预过滤，只对高质量/新颖内容做深度分析
- 幂等性：URL + title hash 去重，重跑不产生重复
- 全链路延迟目标：< 10 分钟

## 知识图谱设计

### 实体类型
Technology、Event、Organization、Person、Concept、Trend、Paper

### 关系类型
depends_on、drives、competes_with、authored_by/created_by、implements、evolves_from/replaces、published_in、related_to

### 时序特性
基于 Graphiti 双时态有效性窗口 (valid_at / invalid_at)，事实可"过期"而不丢失历史，支持：
- 技术演进时间线查询
- 某领域 6 个月内上升/消退趋势
- 公司技术栈变化追踪
- 竞争格局变迁

### 三元组抽取
- Schema 约束：Pydantic/Literal 枚举限制实体和关系类型
- 信心度标注：EXTRACTED / INFERRED / SPECULATIVE
- 实体对齐：新三元组与已有图谱合并同一实体的不同表述
- 批量分析：多相关内容一起给 LLM，发现跨文档关联

### 检索方式
语义搜索 + 图遍历 + 时序查询 + 混合 RRF (语义+图+关键词+时间衰减)

## 探索/利用机制

### 三层推荐策略

| 策略 | 信号源 | 排序依据 |
|------|--------|----------|
| 深耕 (Exploit) | 用户常读源 + 同类高评分 | 质量评分 × 兴趣匹配度 |
| 扩展 (Expand) | KG 中相邻实体 (后端→基础设施/安全) | 图距离衰减 × 信号强度 |
| 探索 (Explore) | 从未接触的领域 + 高信号强度 | 信号强度 × 新颖度 × 领域多样性 |

### 排序算法

```
最终得分 = W_exploit × Score_exploit + W_expand × Score_expand + W_explore × Score_explore
```

权重由滑块位置决定，提供快速预设：早间精读 (偏深耕)、日常浏览 (平衡)、周末探索 (偏随机)。

### 用户兴趣模型
- 隐式反馈：点击、阅读时长、保存到知识库
- 显式反馈：👍/👎、收藏、关注/取消关注源
- 兴趣衰减：长时间未互动的领域权重自然衰减
- 冷启动：首次使用通过一组快速选择建立初始模型

## 分发设计

### Email 日报
- 频率：每天 8:00
- 格式：HTML 完整日报
- 内容：三级分层 (🔴范式信号 → 🟡高信号精选 → 🔵快速扫描) + 链接到 Web 探索

### 企业微信 Bot
- 频率：每天 8:00 早报 + 18:00 晚报
- 格式：Markdown + 图文卡片
- 内容：精选摘要 + 1篇深度分析
- 交互：回复「查看」打开 Web / 回复「偏好」调整设置

### Web 探索界面
- 主视图：Feed 信息流卡片 + 右侧上下文面板 (图谱预览/热点/源多样性)
- 五种视图模式：Feed / 图谱 (D3.js 交互可视化) / 趋势 (时序) / 信号 (跨源共识/分歧) / 搜索
- 推荐滑块 + 分类标签过滤
- 每条内容展示：分类、信号强度、跨源分析摘要、来源多样性、与用户兴趣关联

## 技术栈

| 层 | 技术 | 选型理由 |
|----|------|----------|
| 采集 | Go | 高性能并发采集，Miniflux 原生 Go |
| 处理 | Python | AI/LLM 生态最成熟，Graphiti 原生支持 |
| 消息队列 | Redis Streams | 轻量，已有 Redis 缓存需求 |
| 主存储 | PostgreSQL | 成熟可靠，全文搜索 |
| 图存储 | Neo4j | 功能全面，Graphiti 首要后端 |
| LLM | Anthropic Claude + Ollama | Claude 深度分析，Ollama 轻量任务备选 |
| 前端 | Next.js + D3.js | React 生态，D3 图谱可视化 |
| 部署 | Docker Compose | 一键启动，每层独立容器 |

## 工程结构

```
broad-space/
├── docker-compose.yml
├── .env.example
├── collector/          # Go 采集服务
│   ├── cmd/collector/
│   ├── internal/sources/      # RSS, HN, Reddit, 知乎, V2EX, GitHub, ArXiv
│   ├── internal/normalizer/
│   ├── internal/queue/        # Redis Streams
│   └── config/sources.yaml
├── processor/          # Python 处理服务
│   ├── pipeline/       # dedup, classifier, summarizer, analyzer, ranker
│   ├── llm/prompts/
│   └── worker.py
├── knowledge/          # 知识图谱服务
│   ├── graphiti_config.yaml
│   ├── extractor.py    # 三元组抽取
│   └── retriever.py    # 混合检索
├── web/                # Next.js 前端
│   └── src/components/ # feed, graph, trend, slider
├── delivery/           # 分发服务
│   ├── email/templates/
│   └── wecom/bot.py
└── api/                # 统一 REST API
```

## 测试策略

| 层级 | 范围 | 工具 | 关键用例 |
|------|------|------|----------|
| Go 单测 | 采集器、归一化器 | go test | 各源解析正确性、异常响应 |
| Python 单测 | 去重、分类、摘要、分析 | pytest | Pipeline 步骤输入输出验证 |
| LLM 评测 | Prompt 质量、三元组准确性 | pytest + 标注集 | 分类准确率、摘要质量、三元组 F1 |
| 集成测试 | Pipeline 端到端 | pytest + Docker | 采集→分析→图谱→推送全链路 |
| 前端测试 | 组件渲染、交互 | Vitest + Playwright | Feed 渲染、滑块交互、图谱操作 |

## 监控与容错

- **监控指标**：采集成功率/延迟、LLM 调用量/成本/延迟、日吞吐量、KG 规模、用户交互率
- **容错**：单源失败不影响整体、LLM 调用自动重试+降级、Redis 持久化、Pipeline 幂等

## 风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| LLM 成本过高 | 深度分析不可持续 | 先做预过滤，仅对 top 20% 高质量内容深度分析 |
| Graphiti 学习曲线 | 知识层开发延期 | 先用简化版 (直接存三元组到 Neo4j)，再迁移 Graphiti |
| 微信个人号封号 | 推送渠道中断 | 主推企业微信，个人微信作为可选实验通道 |
| 中文源质量参差 | 信息噪声大 | LLM 信号强度评分 + 用户反馈闭环过滤 |
