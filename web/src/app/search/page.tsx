"use client";

import { useState, useEffect } from "react";
import { fetchContent, fetchGraph, ContentItem, GraphSearchResponse } from "@/lib/api";

type SearchMode = "content" | "graph";

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("content");
  const [loading, setLoading] = useState(false);
  const [contentResults, setContentResults] = useState<ContentItem[]>([]);
  const [graphResults, setGraphResults] = useState<GraphSearchResponse | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const isDark = theme === "dark";
  const bgColor = isDark ? "bg-[#0f0f1a]" : "bg-gray-50";
  const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-600";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";

  const handleSearch = async () => {
    if (!query.trim()) return;

    setLoading(true);
    setHasSearched(true);

    try {
      if (mode === "content") {
        const data = await fetchContent({ limit: 20 });
        // Simple client-side filter since API doesn't support full-text search
        const filtered = data.filter(item =>
          item.title.toLowerCase().includes(query.toLowerCase()) ||
          item.summary.toLowerCase().includes(query.toLowerCase()) ||
          item.categories.some(c => c.toLowerCase().includes(query.toLowerCase()))
        );
        setContentResults(filtered);
        setGraphResults(null);
      } else {
        const data = await fetchGraph({ query, limit: 30 });
        setGraphResults(data);
        setContentResults([]);
      }
    } catch (e) {
      console.error("Search error:", e);
    } finally {
      setLoading(false);
    }
  };

  const getSignalColor = (signal: number) => {
    if (signal >= 0.8) return "text-red-500";
    if (signal >= 0.5) return "text-yellow-500";
    return "text-blue-500";
  };

  return (
    <div className={`${bgColor} min-h-screen`}>
      {/* Header */}
      <header className={`${cardBg} border-b ${borderColor} px-6 py-3`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className={`text-xl font-bold ${textPrimary}`}>🔍 全局搜索</h1>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`text-sm px-3 py-1 rounded border ${borderColor} ${textPrimary} hover:opacity-80`}
          >
            {isDark ? "☀️ 浅色" : "🌙 暗色"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Search Bar */}
        <div className={`${cardBg} border ${borderColor} rounded-lg p-6 mb-6`}>
          {/* Mode Toggle */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode("content")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "content"
                  ? "bg-blue-600 text-white"
                  : isDark
                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              📄 内容搜索
            </button>
            <button
              onClick={() => setMode("graph")}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                mode === "graph"
                  ? "bg-blue-600 text-white"
                  : isDark
                  ? "bg-gray-700 text-gray-300 hover:bg-gray-600"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              🧠 图谱搜索
            </button>
          </div>

          {/* Search Input */}
          <div className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder={mode === "content" ? "搜索文章标题、摘要、分类..." : "搜索知识图谱实体..."}
              className={`flex-1 border rounded px-4 py-2 text-sm ${
                isDark ? "bg-gray-800 text-gray-100 border-gray-600" : "bg-white text-gray-900 border-gray-200"
              }`}
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="bg-blue-600 text-white px-6 py-2 rounded text-sm hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "搜索中..." : "搜索"}
            </button>
          </div>
        </div>

        {/* Results */}
        {!hasSearched ? (
          <div className={`text-center py-12 ${textSecondary}`}>
            <p className="text-lg mb-2">输入关键词开始搜索</p>
            <p className="text-sm">支持文章标题、摘要、分类、知识图谱实体等</p>
          </div>
        ) : loading ? (
          <div className={`text-center py-12 ${textSecondary}`}>
            <p>搜索中...</p>
          </div>
        ) : mode === "content" ? (
          /* Content Search Results */
          <div>
            <div className="mb-4">
              <span className={`text-sm ${textSecondary}`}>
                找到 {contentResults.length} 条相关内容
              </span>
            </div>
            {contentResults.length === 0 ? (
              <div className={`text-center py-12 ${textSecondary}`}>
                <p>未找到相关文章，请尝试其他关键词</p>
              </div>
            ) : (
              <div className="space-y-4">
                {contentResults.map((item) => (
                  <div key={item.id} className={`${cardBg} border ${borderColor} rounded-lg p-4 hover:shadow-md transition cursor-pointer`}>
                    <div className="flex justify-between items-start">
                      <h3 className={`font-semibold ${textPrimary} flex-1`}>{item.title}</h3>
                      <span className={`font-mono text-lg ${getSignalColor(item.signal_strength)}`}>
                        {item.signal_strength.toFixed(2)}
                      </span>
                    </div>
                    <p className={`${textSecondary} mt-2 text-sm`}>{item.summary}</p>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      {item.categories.map((cat) => (
                        <span key={cat} className={`text-xs px-2 py-1 rounded ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}>
                          {cat}
                        </span>
                      ))}
                    </div>
                    <div className={`mt-3 text-xs ${textSecondary}`}>
                      来源: {item.sources.map(s => s.name).join(", ")}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Graph Search Results */
          <div>
            <div className="mb-4">
              <span className={`text-sm ${textSecondary}`}>
                找到 {graphResults?.results.length || 0} 条图谱结果
              </span>
            </div>
            {!graphResults || graphResults.results.length === 0 ? (
              <div className={`text-center py-12 ${textSecondary}`}>
                <p>未找到相关图谱，请尝试其他关键词</p>
              </div>
            ) : (
              <div className="space-y-4">
                {graphResults.results.map((result, idx) => (
                  <div key={idx} className={`${cardBg} border ${borderColor} rounded-lg p-4`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                        {idx + 1}
                      </div>
                      <span className={`font-mono ${textSecondary}`}>score: {result.score.toFixed(2)}</span>
                    </div>
                    <p className={`${textPrimary} text-sm leading-relaxed`}>{result.text}</p>
                    {result.entities.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {result.entities.map((entity, i) => (
                          <span key={i} className={`text-xs px-2 py-1 rounded ${isDark ? "bg-purple-500/20 text-purple-400" : "bg-purple-100 text-purple-600"}`}>
                            {entity}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}