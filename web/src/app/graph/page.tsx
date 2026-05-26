"use client";
import { useState, useEffect } from "react";
import GraphCanvas, { GraphNode, GraphLink } from "@/components/GraphCanvas";
import { fetchGraph, GraphSearchResult } from "@/lib/api";

function buildGraphFromResults(results: GraphSearchResult[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodesMap: Record<string, GraphNode> = {};
  const links: GraphLink[] = [];

  results.forEach((r, idx) => {
    const centerId = `result_${idx}`;
    nodesMap[centerId] = {
      id: r.text.substring(0, 50),
      group: "Concept",
      signal: r.score,
      summary: r.text,
    };

    const words = r.text.split(/[\s,.()]+/).filter(
      (w) => w.length > 3 && /^[A-Z][a-z]/.test(w) && !["The", "This", "That", "From", "With"].includes(w)
    );

    words.slice(0, 5).forEach((word) => {
      if (!nodesMap[word]) {
        nodesMap[word] = { id: word, group: "Technology", signal: 0.5 };
      }
      links.push({ source: centerId, target: word, value: 1 });
    });
  });

  return {
    nodes: Object.values(nodesMap),
    links: links.slice(0, Math.min(links.length, Object.keys(nodesMap).length * 3)),
  };
}

const SUGGESTIONS = [
  "AI Agent", "WebAssembly", "Rust", "Claude", "Machine Learning",
  "Kubernetes", "React", "Python", "Database", "Security"
];

export default function GraphPage() {
  const [query, setQuery] = useState("AI");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [inputValue, setInputValue] = useState("AI");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    setStatus("Loading...");
    fetchGraph({ query, limit: 50 })
      .then((data) => {
        if (!data.results || data.results.length === 0) {
          setStatus("No results. Process some articles first.");
          setNodes([]);
          setLinks([]);
          return;
        }
        const { nodes: n, links: l } = buildGraphFromResults(data.results);
        setNodes(n);
        setLinks(l);
        setStatus(`${n.length} nodes, ${l.length} connections`);
      })
      .catch((e) => setStatus(`Error: ${e.message}`));
  }, [query]);

  const isDark = theme === "dark";
  const bgColor = isDark ? "bg-[#0f0f1a]" : "bg-gray-50";
  const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-600";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";

  const handleNodeSelect = (node: GraphNode) => {
    setSelectedNode(node);
  };

  return (
    <div className={`${bgColor} min-h-screen`}>
      {/* Header */}
      <header className={`${cardBg} border-b ${borderColor} px-6 py-3`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className={`text-xl font-bold ${textPrimary}`}>🗺️ 知识图谱</h1>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`text-sm px-3 py-1 rounded border ${borderColor} ${textPrimary} hover:opacity-80`}
          >
            {isDark ? "☀️ 浅色" : "🌙 暗色"}
          </button>
        </div>
      </header>

      <main className="p-6">
        {/* Search Bar */}
        <div className={`${cardBg} border ${borderColor} rounded-lg p-4 mb-4 max-w-3xl`}>
          <div className="flex gap-2 mb-3">
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
                placeholder="搜索知识图谱..."
                className={`w-full border rounded px-3 py-2 text-sm ${isDark ? "bg-gray-800 text-gray-100 border-gray-600" : "bg-white text-gray-900 border-gray-200"}`}
              />
              {showSuggestions && (
                <div className={`absolute top-full left-0 right-0 mt-1 ${cardBg} border ${borderColor} rounded-lg shadow-lg z-10`}>
                  {SUGGESTIONS.filter(s => s.toLowerCase().includes(inputValue.toLowerCase())).map(s => (
                    <button
                      key={s}
                      onMouseDown={() => {
                        setInputValue(s);
                        setQuery(s);
                        setShowSuggestions(false);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm ${isDark ? "hover:bg-gray-700" : "hover:bg-gray-100"} ${textSecondary}`}
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
          <p className={`text-xs ${textSecondary}`}>{status}</p>
        </div>

        <div className="flex gap-6">
          {/* Graph Canvas */}
          <div className={`${cardBg} border ${borderColor} rounded-lg flex-1 overflow-hidden`} style={{ minHeight: "600px" }}>
            <GraphCanvas
              nodes={nodes}
              links={links}
              onNodeSelect={handleNodeSelect}
              selectedNode={selectedNode}
              theme={theme}
            />
          </div>

          {/* Node Detail Panel */}
          <div className={`${cardBg} border ${borderColor} rounded-lg w-80 flex-shrink-0`}>
            <div className="p-4">
              <h3 className={`font-semibold ${textPrimary} mb-3`}>节点详情</h3>
              {selectedNode ? (
                <div className="space-y-3">
                  <div>
                    <div className={`text-sm ${textSecondary}`}>名称</div>
                    <div className={`font-medium ${textPrimary}`}>{selectedNode.id}</div>
                  </div>
                  <div>
                    <div className={`text-sm ${textSecondary}`}>类型</div>
                    <div className={`font-medium ${textPrimary}`}>{selectedNode.group}</div>
                  </div>
                  <div>
                    <div className={`text-sm ${textSecondary}`}>信号强度</div>
                    <div className={`font-mono ${textPrimary}`}>
                      {selectedNode.signal?.toFixed(2) || "N/A"}
                    </div>
                  </div>
                  {selectedNode.summary && (
                    <div>
                      <div className={`text-sm ${textSecondary}`}>摘要</div>
                      <div className={`text-sm ${textPrimary} mt-1`}>{selectedNode.summary}</div>
                    </div>
                  )}
                  <div className="pt-3 border-t border-gray-600">
                    <div className="flex gap-2">
                      <button
                        onClick={() => setQuery(selectedNode.id)}
                        className="flex-1 bg-blue-500 text-white px-3 py-1.5 rounded text-xs hover:bg-blue-600"
                      >
                        展开关系
                      </button>
                      <button
                        onClick={() => setSelectedNode(null)}
                        className={`px-3 py-1.5 rounded text-xs ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}
                      >
                        清除
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className={`text-sm ${textSecondary}`}>
                  <p>点击图谱中的节点查看详情</p>
                  <div className={`mt-4 space-y-2`}>
                    <div className={`text-xs ${textSecondary}`}>统计</div>
                    <div className="flex justify-between">
                      <span className={textSecondary}>节点数</span>
                      <span className={textPrimary}>{nodes.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={textSecondary}>连接数</span>
                      <span className={textPrimary}>{links.length}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}