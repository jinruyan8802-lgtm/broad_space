"use client";

import { useState, useEffect } from "react";
import {
  fetchAnalytics,
  fetchDashboardStats,
  AnalyticsResponse,
  DashboardStatsResponse,
} from "@/lib/api";

import KPICards from "@/components/dashboard/KPICards";
import SourceCollectionChart from "@/components/dashboard/SourceCollectionChart";
import CollectionTrendChart from "@/components/dashboard/CollectionTrendChart";
import SourceHealthPanel from "@/components/dashboard/SourceHealthPanel";
import CategoryDistribution from "@/components/dashboard/CategoryDistribution";
import SignalQualityCard from "@/components/dashboard/SignalQualityCard";
import KnowledgeGraphCard from "@/components/dashboard/KnowledgeGraphCard";
import ActivityLog from "@/components/dashboard/ActivityLog";

export default function DashboardPage() {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  const loadData = () => {
    Promise.all([fetchAnalytics(7), fetchDashboardStats()])
      .then(([analyticsData, statsData]) => {
        setAnalytics(analyticsData);
        setStats(statsData);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 60000);
    return () => clearInterval(interval);
  }, []);

  const isDark = theme === "dark";
  const bgColor = isDark ? "bg-[#0f0f1a]" : "bg-gray-50";
  const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";

  if (loading) {
    return (
      <div className={`${bgColor} min-h-screen`}>
        <main className="max-w-7xl mx-auto p-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className={`${cardBg} border ${borderColor} rounded-lg p-4 h-24 animate-pulse`} />
            ))}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-4">
            <div className="md:col-span-3"><div className={`${cardBg} border ${borderColor} rounded-lg p-4 h-72 animate-pulse`} /></div>
            <div className="md:col-span-2"><div className={`${cardBg} border ${borderColor} rounded-lg p-4 h-72 animate-pulse`} /></div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className={`${cardBg} border ${borderColor} rounded-lg p-4 h-64 animate-pulse`} />
            <div className={`${cardBg} border ${borderColor} rounded-lg p-4 h-64 animate-pulse`} />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className={`${cardBg} border ${borderColor} rounded-lg p-4 h-72 animate-pulse`} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${bgColor} min-h-screen`}>
        <main className="max-w-7xl mx-auto p-6">
          <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
            Error: {error}
          </div>
        </main>
      </div>
    );
  }

  const DEFAULT_SOURCES = [
    "hackernews", "github_trending", "arxiv", "v2ex",
    "miniflux", "juejin", "lobsters", "devto", "kr36",
  ];

  return (
    <div className={`${bgColor} min-h-screen`}>
      {/* Header */}
      <header className={`${cardBg} border-b ${borderColor} px-6 py-3`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className={`text-lg font-bold ${textPrimary}`}>📊 Dashboard</h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">
              自动刷新 · 60s
            </span>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className={`px-3 py-1 rounded text-xs ${isDark ? "bg-[#333] text-gray-300" : "bg-gray-200 text-gray-700"}`}
            >
              {isDark ? "☀️ Light" : "🌙 Dark"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Row 1: KPI Cards */}
        {stats && (
          <KPICards
            todayArticles={stats.today_articles}
            totalArticles={stats.total_articles}
            graphNodes={stats.graph.nodes}
            graphEdges={stats.graph.edges}
            onlineSources={stats.source_health.filter((s) => s.status === "online").length}
            totalSources={DEFAULT_SOURCES.length}
            theme={theme}
          />
        )}

        {/* Row 2: Source Collection + Source Health */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-4">
          <div className="md:col-span-3">
            {analytics && <SourceCollectionChart data={analytics.source_counts} theme={theme} />}
          </div>
          <div className="md:col-span-2">
            {stats && <SourceHealthPanel data={stats.source_health} theme={theme} />}
          </div>
        </div>

        {/* Row 3: 7-day Trend + Signal Quality */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          {analytics && <CollectionTrendChart data={analytics.volume_timeline} theme={theme} />}
          {analytics && (
            <SignalQualityCard
              signalDistribution={analytics.signal_distribution}
              scoreDistribution={analytics.score_distribution}
              theme={theme}
            />
          )}
        </div>

        {/* Row 4: Category Distribution + Knowledge Graph + Activity Log */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          {analytics && <CategoryDistribution data={analytics.category_counts} theme={theme} />}
          {stats && <KnowledgeGraphCard graph={stats.graph} theme={theme} />}
          {stats && <ActivityLog data={stats.recent_activity} theme={theme} />}
        </div>
      </main>
    </div>
  );
}
