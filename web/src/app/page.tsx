"use client";

import { useState, useEffect, useCallback } from "react";
import FeedCard from "@/components/FeedCard";
import ContextPanel from "@/components/ContextPanel";
import { useLanguage } from "@/contexts/LanguageContext";
import { fetchContent, fetchAnalytics, ContentItem, AnalyticsResponse } from "@/lib/api";

const CATEGORIES = [
  "AI/ML",
  "Infrastructure",
  "Programming Languages",
  "Security",
  "Frontend",
  "Mobile",
  "Database",
  "DevOps",
  "Open Source",
  "Academic",
  "Startup",
  "Science",
  "Hardware",
  "Product",
];

export default function Home() {
  const [items, setItems] = useState<ContentItem[]>([]);
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { displayLanguage, toggleLanguage } = useLanguage();

  const loadContent = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContent({
        limit: 30,
        ...(activeCategory ? { category: activeCategory } : {}),
      });
      setItems(data);
    } catch (e: any) {
      setError(e.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  const loadAnalytics = useCallback(async () => {
    try {
      const data = await fetchAnalytics(7);
      setAnalytics(data);
    } catch (e: any) {
      console.error("Failed to load analytics:", e);
    }
  }, []);

  useEffect(() => {
    loadContent();
    loadAnalytics();
  }, [loadContent, loadAnalytics]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      loadContent();
      loadAnalytics();
    }, 60_000);
    return () => clearInterval(interval);
  }, [loadContent, loadAnalytics]);

  const isDark = theme === "dark";
  const bgColor = isDark ? "bg-[#0f0f1a]" : "bg-gray-50";
  const textColor = isDark ? "text-gray-100" : "text-gray-900";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";

  const filteredItems = searchQuery
    ? items.filter(item =>
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.summary.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.categories.some(c => c.toLowerCase().includes(searchQuery.toLowerCase()))
      )
    : items;

  return (
    <div className={`${bgColor} min-h-screen`}>
      {/* Header */}
      <header className={`${cardBg} border-b ${borderColor} px-6 py-3`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className={`text-xl font-bold ${textColor}`}>🔭 BroadSpace</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={toggleLanguage}
              className={`text-sm px-3 py-1 rounded border ${borderColor} ${textColor} hover:opacity-80`}
            >
              {displayLanguage === "zh" ? "EN 原文" : "ZH 中文"}
            </button>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={`text-sm px-3 py-1 rounded border ${borderColor} ${textColor} hover:opacity-80`}
            >
              {isDark ? "☀️ 浅色" : "🌙 暗色"}
            </button>
            <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
              {new Date().toLocaleDateString("zh-CN")}
            </span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-6">
        <div className="flex gap-6">
          {/* Left: Feed */}
          <div className="flex-1">
            {/* Search input */}
            <div className={`${cardBg} border ${borderColor} rounded-lg px-4 py-3 mb-4`}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索文章标题、摘要、分类..."
                  className={`flex-1 border rounded px-3 py-2 text-sm ${
                    isDark ? "bg-gray-800 text-gray-100 border-gray-600" : "bg-white text-gray-900 border-gray-200"
                  }`}
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery("")}
                    className={`px-3 py-2 rounded text-sm ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"} hover:opacity-80`}
                  >
                    清除
                  </button>
                )}
              </div>
            </div>

            {/* Category filter chips */}
            <div className="flex flex-wrap gap-2 mb-6">
              <button
                onClick={() => setActiveCategory(null)}
                className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                  activeCategory === null
                    ? "bg-blue-600 text-white border-blue-600"
                    : isDark
                    ? "bg-[#1a1a2e] text-gray-300 border-gray-600 hover:border-blue-400"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                }`}
              >
                全部
              </button>
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setActiveCategory(cat)}
                  className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                    activeCategory === cat
                      ? "bg-blue-600 text-white border-blue-600"
                      : isDark
                      ? "bg-[#1a1a2e] text-gray-300 border-gray-600 hover:border-blue-400"
                      : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Score distribution bar */}
            {analytics && (
              <div className={`${cardBg} border ${borderColor} rounded-lg px-4 py-3 mb-6 flex items-center gap-4`}>
                <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  📊 今日覆盖 {analytics.source_counts.reduce((s, c) => s + c.count, 0)} 条 · {analytics.category_counts.length} 个领域
                </span>
                <div className="flex-1 flex gap-1 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-blue-500 h-full"
                    style={{ width: `${analytics.score_distribution.avg_exploit * 100}%` }}
                    title={`深耕 ${(analytics.score_distribution.avg_exploit * 100).toFixed(0)}%`}
                  />
                  <div
                    className="bg-green-500 h-full"
                    style={{ width: `${analytics.score_distribution.avg_expand * 100}%` }}
                    title={`扩展 ${(analytics.score_distribution.avg_expand * 100).toFixed(0)}%`}
                  />
                  <div
                    className="bg-purple-500 h-full"
                    style={{ width: `${analytics.score_distribution.avg_explore * 100}%` }}
                    title={`探索 ${(analytics.score_distribution.avg_explore * 100).toFixed(0)}%`}
                  />
                </div>
                <span className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                  深耕 {Math.round(analytics.score_distribution.avg_exploit * 100)}% · 扩展 {Math.round(analytics.score_distribution.avg_expand * 100)}% · 探索 {Math.round(analytics.score_distribution.avg_explore * 100)}%
                </span>
              </div>
            )}

            {/* Content */}
            {loading && items.length === 0 ? (
              <p className={`${isDark ? "text-gray-400" : "text-gray-500"} text-sm`}>Loading...</p>
            ) : error ? (
              <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
                Error: {error}
              </div>
            ) : filteredItems.length === 0 ? (
              <p className={`${isDark ? "text-gray-400" : "text-gray-500"} text-sm`}>
                {searchQuery ? "未找到匹配内容，请尝试其他关键词" : "No content yet. Run the pipeline to populate."}
              </p>
            ) : (
              <div className="space-y-4">
                {filteredItems.map((a) => (
                  <FeedCard
                    key={a.id}
                    {...a}
                    theme={theme}
                    isSelected={selectedItem?.id === a.id}
                    onClick={() => setSelectedItem(selectedItem?.id === a.id ? null : a)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right: Context Panel */}
          {analytics && (
            <div className="w-80 flex-shrink-0">
              <ContextPanel
                trendingTopics={analytics.trending_topics}
                sourceDiversity={analytics.source_diversity_by_category}
                scoreDistribution={analytics.score_distribution}
                theme={theme}
                selectedContent={selectedItem ? {
                  title: selectedItem.title,
                  categories: selectedItem.categories,
                } : undefined}
              />
            </div>
          )}
        </div>
      </main>
    </div>
  );
}