"use client";
import { useState, useEffect, useCallback } from "react";
import GraphCanvas, { GraphNode, GraphLink } from "@/components/GraphCanvas";
import { fetchGraph, GraphSearchResult } from "@/lib/api";

interface GraphEdge {
  source: string;
  target: string;
  relation: string;
  relationZh: string;
  confidence: string;
}

function buildGraphFromTriples(results: GraphSearchResult[]): {
  nodes: GraphNode[];
  links: GraphLink[];
} {
  const nodeMap = new Map<string, GraphNode>();
  const edgeSet = new Map<string, GraphEdge>();

  function ensureNode(name: string, nameZh: string, group: string): string {
    if (!name) return "";
    const id = name;
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        id,
        label: name,
        labelZh: nameZh || undefined,
        group: group || "Concept",
      });
    }
    return id;
  }

  for (const r of results) {
    const sid = ensureNode(r.subject, r.subject_zh, r.subject_type);
    const oid = ensureNode(r.object, r.object_zh, r.object_type);
    if (!sid || !oid || sid === oid) continue;

    const edgeKey = [sid, oid].sort().join("::");
    const existing = edgeSet.get(edgeKey);
    if (existing) {
      // Merge relations
      if (!existing.relation.includes(r.predicate)) {
        existing.relation += ", " + r.predicate;
        existing.relationZh += ", " + (r.predicate_zh || r.predicate);
      }
    } else {
      edgeSet.set(edgeKey, {
        source: sid,
        target: oid,
        relation: r.predicate,
        relationZh: r.predicate_zh || r.predicate,
        confidence: r.confidence || "EXTRACTED",
      });
    }
  }

  const links: GraphLink[] = [...edgeSet.values()].map((e) => ({
    source: e.source,
    target: e.target,
    relation: e.relation,
    relationZh: e.relationZh,
    confidence: e.confidence,
  }));

  // Filter orphan nodes
  const linked = new Set<string>();
  links.forEach((l) => {
    linked.add(l.source);
    linked.add(l.target);
  });
  const nodes = [...nodeMap.values()].filter((n) => linked.has(n.id));

  return { nodes, links };
}

const SUGGESTIONS = [
  "AI Agent", "WebAssembly", "Rust", "Claude", "Machine Learning",
  "Kubernetes", "React", "Python", "Database", "Security",
];

export default function GraphPage() {
  const [query, setQuery] = useState("AI");
  const [inputValue, setInputValue] = useState("AI");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const isDark = theme === "dark";
  const bgColor = isDark ? "bg-[#0f0f1a]" : "bg-gray-50";
  const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-600";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";

  useEffect(() => {
    setStatus("搜索中...");
    fetchGraph({ query, limit: 50 })
      .then((data) => {
        if (!data.results || data.results.length === 0) {
          setStatus("无结果，请先处理一些文章");
          setNodes([]);
          setLinks([]);
          return;
        }
        const { nodes: n, links: l } = buildGraphFromTriples(data.results);
        setNodes(n);
        setLinks(l);
        setStatus(`${n.length} 个节点，${l.length} 条关系`);
      })
      .catch((e) => setStatus(`错误: ${e.message}`));
  }, [query]);

  // Compute neighbor info for selected node
  const neighbors = selectedNode
    ? (() => {
        const set = new Set<string>();
        const rels: { neighbor: string; neighborZh: string; relation: string; relationZh: string }[] = [];
        for (const l of links) {
          const sid = l.source;
          const tid = l.target;
          if (sid === selectedNode.id) {
            set.add(tid);
            const targetNode = nodes.find((n) => n.id === tid);
            rels.push({
              neighbor: tid,
              neighborZh: targetNode?.labelZh || tid,
              relation: l.relation || "",
              relationZh: l.relationZh || l.relation || "",
            });
          } else if (tid === selectedNode.id) {
            set.add(sid);
            const sourceNode = nodes.find((n) => n.id === sid);
            rels.push({
              neighbor: sid,
              neighborZh: sourceNode?.labelZh || sid,
              relation: l.relation || "",
              relationZh: l.relationZh || l.relation || "",
            });
          }
        }
        return { count: set.size, rels };
      })()
    : null;

  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    setSelectedNode(node);
  }, []);

  return (
    <div className={`${bgColor} min-h-screen`}>
      {/* Header */}
      <header className={`${cardBg} border-b ${borderColor} px-6 py-3`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className={`text-xl font-bold ${textPrimary}`}>🗺️ 知识图谱</h1>
          <div className="flex items-center gap-3">
            <span className={`text-xs ${textSecondary}`}>{status}</span>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={`text-sm px-3 py-1 rounded border ${borderColor} ${textPrimary} hover:opacity-80`}
            >
              {isDark ? "☀️ 浅色" : "🌙 暗色"}
            </button>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-7xl mx-auto">
        {/* Search Bar */}
        <div className={`${cardBg} border ${borderColor} rounded-lg p-4 mb-4`}>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setQuery(inputValue);
                }}
                placeholder="搜索知识图谱...（如 AI Agent, Rust, Kubernetes）"
                className={`w-full border rounded px-3 py-2 text-sm ${
                  isDark
                    ? "bg-gray-800 text-gray-100 border-gray-600"
                    : "bg-white text-gray-900 border-gray-200"
                }`}
              />
              {showSuggestions && (
                <div
                  className={`absolute top-full left-0 right-0 mt-1 ${cardBg} border ${borderColor} rounded-lg shadow-lg z-10`}
                >
                  {SUGGESTIONS.filter((s) =>
                    s.toLowerCase().includes(inputValue.toLowerCase())
                  ).map((s) => (
                    <button
                      key={s}
                      onMouseDown={() => {
                        setInputValue(s);
                        setQuery(s);
                        setShowSuggestions(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm ${
                        isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"
                      } ${textSecondary}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => setQuery(inputValue)}
              className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600"
            >
              搜索
            </button>
          </div>
        </div>

        <div className="flex gap-4">
          {/* Graph Canvas */}
          <div
            className={`${cardBg} border ${borderColor} rounded-lg flex-1 overflow-hidden`}
            style={{ minHeight: "600px" }}
          >
            <GraphCanvas
              nodes={nodes}
              links={links}
              onNodeSelect={handleNodeSelect}
              selectedNode={selectedNode}
              theme={theme}
            />
          </div>

          {/* Detail Panel */}
          <div className={`${cardBg} border ${borderColor} rounded-lg w-80 flex-shrink-0 overflow-y-auto`} style={{ maxHeight: "660px" }}>
            <div className="p-4">
              {selectedNode ? (
                <>
                  {/* Node info */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{
                          background:
                            selectedNode.group === "Entity" ? "#06b6d4" : "#3b82f6",
                        }}
                      />
                      <span className={`text-xs ${textSecondary}`}>{selectedNode.group}</span>
                    </div>
                    <h3 className={`font-bold text-lg ${textPrimary}`}>
                      {selectedNode.labelZh || selectedNode.label}
                    </h3>
                    {selectedNode.labelZh && selectedNode.labelZh !== selectedNode.label && (
                      <p className={`text-sm ${textSecondary}`}>{selectedNode.label}</p>
                    )}
                    <p className={`text-xs ${textSecondary} mt-1`}>
                      {neighbors?.count || 0} 个关联实体
                    </p>
                  </div>

                  {/* Relationships */}
                  {neighbors && neighbors.rels.length > 0 && (
                    <div className="mb-4">
                      <h4 className={`text-sm font-semibold ${textPrimary} mb-2`}>关系</h4>
                      <div className="space-y-1.5 max-h-80 overflow-y-auto">
                        {neighbors.rels.map((rel, i) => (
                          <button
                            key={i}
                            onClick={() => {
                              const n = nodes.find((n) => n.id === rel.neighbor);
                              if (n) setSelectedNode(n);
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded text-xs ${
                              isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"
                            }`}
                          >
                            <span className={textPrimary}>
                              {rel.relationZh}
                            </span>
                            <span className={`mx-1.5 ${textSecondary}`}>→</span>
                            <span className="text-blue-400">
                              {rel.neighborZh}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-gray-600">
                    <button
                      onClick={() => {
                        setQuery(selectedNode.labelZh || selectedNode.label);
                        setSelectedNode(null);
                      }}
                      className="flex-1 bg-blue-500 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-600"
                    >
                      搜索相关
                    </button>
                    <button
                      onClick={() => setSelectedNode(null)}
                      className={`px-3 py-1.5 rounded text-xs ${
                        isDark
                          ? "bg-gray-700 text-gray-300"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      清除
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className={`font-semibold ${textPrimary} mb-3`}>节点详情</h3>
                  <p className={`text-sm ${textSecondary} mb-4`}>
                    点击图谱中的节点查看详情
                  </p>

                  {/* Stats */}
                  <div className={`space-y-2 text-xs`}>
                    <div className="flex justify-between">
                      <span className={textSecondary}>节点数</span>
                      <span className={textPrimary}>{nodes.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={textSecondary}>关系数</span>
                      <span className={textPrimary}>{links.length}</span>
                    </div>
                  </div>

                  {/* Usage hint */}
                  <div className={`mt-6 p-3 rounded-lg text-xs ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
                    <p className={`font-medium ${textPrimary} mb-1.5`}>使用说明</p>
                    <ul className={`space-y-1 ${textSecondary}`}>
                      <li>• 搜索关键词查看相关知识图谱</li>
                      <li>• 点击节点进入聚焦模式</li>
                      <li>• 悬停节点高亮关联关系</li>
                      <li>• 拖拽节点调整布局</li>
                      <li>• 滚轮缩放，拖拽平移</li>
                      <li>• 点击空白处退出聚焦</li>
                    </ul>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
