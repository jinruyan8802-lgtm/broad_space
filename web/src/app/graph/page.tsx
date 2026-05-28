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
        group: group || "Unknown",
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
  const [rawResults, setRawResults] = useState<GraphSearchResult[]>([]);

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
          setRawResults([]);
          return;
        }
        setRawResults(data.results);
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

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "text-red-500";
    if (score >= 0.5) return "text-yellow-500";
    return "text-blue-500";
  };

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
                            selectedNode.group === "Technology" ? "#ef4444" :
                            selectedNode.group === "Organization" ? "#22c55e" :
                            selectedNode.group === "Person" ? "#a855f7" :
                            selectedNode.group === "Event" ? "#f59e0b" :
                            selectedNode.group === "Entity" ? "#06b6d4" :
                            selectedNode.group === "Paper" ? "#10b981" :
                            selectedNode.group === "Trend" ? "#f97316" :
                            selectedNode.group === "Platform" ? "#ec4899" :
                            "#3b82f6",
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

                    {/* Entity Type Breakdown */}
                    {nodes.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-600">
                        <div className={`text-xs font-medium ${textPrimary} mb-2`}>实体类型分布</div>
                        <div className="space-y-1">
                          {Object.entries(
                            nodes.reduce((acc, n) => {
                              const type = n.group || "Unknown";
                              acc[type] = (acc[type] || 0) + 1;
                              return acc;
                            }, {} as Record<string, number>)
                          )
                            .sort((a, b) => b[1] - a[1])
                            .map(([type, count]) => (
                              <div key={type} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span
                                    className="w-2 h-2 rounded-full"
                                    style={{
                                      background:
                                        type === "Technology" ? "#ef4444" :
                                        type === "Organization" ? "#22c55e" :
                                        type === "Person" ? "#a855f7" :
                                        type === "Event" ? "#f59e0b" :
                                        type === "Entity" ? "#06b6d4" :
                                        type === "Paper" ? "#10b981" :
                                        type === "Trend" ? "#f97316" :
                                        type === "Platform" ? "#ec4899" :
                                        "#3b82f6",
                                    }}
                                  />
                                  <span className={textSecondary}>{type}</span>
                                </div>
                                <span className={`font-mono ${textPrimary}`}>{count}</span>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}
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

        {/* Search Results Table */}
        {rawResults.length > 0 && (
          <div className={`${cardBg} border ${borderColor} rounded-lg mt-4 overflow-hidden`}>
            <div className="px-4 py-3 border-b border-gray-600">
              <h3 className={`text-sm font-semibold ${textPrimary}`}>
                搜索结果 ({rawResults.length} 条)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={isDark ? "bg-gray-800" : "bg-gray-50"}>
                    <th className={`px-4 py-2 text-left font-medium ${textSecondary}`}>#</th>
                    <th className={`px-4 py-2 text-left font-medium ${textSecondary}`}>Score</th>
                    <th className={`px-4 py-2 text-left font-medium ${textSecondary}`}>Text</th>
                    <th className={`px-4 py-2 text-left font-medium ${textSecondary}`}>Entities</th>
                    <th className={`px-4 py-2 text-left font-medium ${textSecondary}`}>Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-700">
                  {rawResults.map((r, idx) => (
                    <tr
                      key={idx}
                      className={`transition-colors ${isDark ? "hover:bg-gray-800" : "hover:bg-gray-50"}`}
                    >
                      <td className={`px-4 py-2 ${textSecondary}`}>{idx + 1}</td>
                      <td className="px-4 py-2">
                        <span className={`font-mono ${getScoreColor(r.score)}`}>
                          {r.score.toFixed(2)}
                        </span>
                      </td>
                      <td className={`px-4 py-2 max-w-md ${textPrimary}`}>
                        <p className="line-clamp-2">{r.text}</p>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {r.entities.slice(0, 3).map((e, i) => (
                            <span key={i} className={`text-xs px-1.5 py-0.5 rounded ${isDark ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-600"}`}>
                              {r.entity_names_zh[i] || e}
                            </span>
                          ))}
                          {r.entities.length > 3 && (
                            <span className={`text-xs ${textSecondary}`}>+{r.entities.length - 3}</span>
                          )}
                        </div>
                      </td>
                      <td className={`px-4 py-2 ${textSecondary}`}>{r.confidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
