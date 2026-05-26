"use client";

import { useState, useEffect } from "react";
import { fetchAnalytics, AnalyticsResponse } from "@/lib/api";

export default function TrendPage() {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    fetchAnalytics(7)
      .then(setAnalytics)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const isDark = theme === "dark";
  const bgColor = isDark ? "bg-[#0f0f1a]" : "bg-gray-50";
  const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-600";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";

  if (loading) {
    return (
      <div className={`${bgColor} min-h-screen flex items-center justify-center`}>
        <p className={textSecondary}>Loading...</p>
      </div>
    );
  }

  if (!analytics) {
    return (
      <div className={`${bgColor} min-h-screen flex items-center justify-center`}>
        <p className="text-red-500">Failed to load analytics</p>
      </div>
    );
  }

  const { volume_timeline, trending_topics, category_counts, source_counts } = analytics;

  // Calculate max volume for chart scaling
  const maxVolume = Math.max(...volume_timeline.map(v => v.count), 1);

  return (
    <div className={`${bgColor} min-h-screen`}>
      {/* Header */}
      <header className={`${cardBg} border-b ${borderColor} px-6 py-3`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className={`text-xl font-bold ${textPrimary}`}>📊 趋势视图</h1>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`text-sm px-3 py-1 rounded border ${borderColor} ${textPrimary} hover:opacity-80`}
          >
            {isDark ? "☀️ 浅色" : "🌙 暗色"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Volume Timeline */}
        <section className="mb-8">
          <h2 className={`text-lg font-semibold ${textPrimary} mb-4`}>📈 近 7 天内容趋势</h2>
          <div className={`${cardBg} border ${borderColor} rounded-lg p-6`}>
            <div className="flex items-end justify-between gap-2 h-48">
              {volume_timeline.map((v, i) => (
                <div key={v.date} className="flex-1 flex flex-col items-center gap-2">
                  <div className="w-full flex items-end justify-center" style={{ height: `${(v.count / maxVolume) * 100}%` }}>
                    <div
                      className={`w-8 rounded-t ${isDark ? "bg-blue-500" : "bg-blue-500"}`}
                      style={{ height: `${Math.max((v.count / maxVolume) * 100, 4)}%` }}
                      title={v.count.toString()}
                    />
                  </div>
                  <span className={`text-xs ${textSecondary}`}>
                    {v.date.split("-").slice(1).join("/")}
                  </span>
                  <span className={`text-xs ${textPrimary} font-mono`}>{v.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Trending Topics */}
        <section className="mb-8">
          <h2 className={`text-lg font-semibold ${textPrimary} mb-4`}>🔥 热点主题趋势</h2>
          <div className={`${cardBg} border ${borderColor} rounded-lg p-6`}>
            {trending_topics.length === 0 ? (
              <p className={textSecondary}>暂无热点数据</p>
            ) : (
              <div className="space-y-3">
                {trending_topics.map((topic) => {
                  const statusColor = topic.status === "rising" ? "text-green-500" : topic.status === "falling" ? "text-red-500" : "text-yellow-500";
                  const statusBg = topic.status === "rising" ? "bg-green-500/20" : topic.status === "falling" ? "bg-red-500/20" : "bg-yellow-500/20";
                  const arrow = topic.status === "rising" ? "↑" : topic.status === "falling" ? "↓" : "→";
                  const changePct = (topic.change_ratio * 100).toFixed(0);

                  return (
                    <div key={topic.topic} className="flex items-center gap-4">
                      <span className={`w-32 text-sm ${textSecondary} truncate`}>{topic.topic}</span>
                      <div className="flex-1 h-4 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${statusBg.replace("/20", "")}`}
                          style={{ width: `${Math.min(Math.abs(topic.change_ratio) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={`text-sm font-mono ${statusColor}`}>
                        {arrow} {changePct}%
                      </span>
                      <span className={`text-xs ${textSecondary}`}>
                        {topic.previous_count} → {topic.current_count}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Category Growth */}
        <section className="mb-8">
          <h2 className={`text-lg font-semibold ${textPrimary} mb-4`}>📂 分类热度排行</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {category_counts.map((cat, i) => (
              <div key={cat.category} className={`${cardBg} border ${borderColor} rounded-lg p-4`}>
                <div className="flex items-center gap-3">
                  <span className={`text-lg font-bold ${textSecondary}`}>#{i + 1}</span>
                  <div className="flex-1">
                    <div className={`font-medium ${textPrimary}`}>{cat.category}</div>
                    <div className={`text-sm ${textSecondary}`}>{cat.count} 篇文章</div>
                  </div>
                  <div className="w-20 h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-500"
                      style={{ width: `${(cat.count / maxVolume) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Source Distribution */}
        <section>
          <h2 className={`text-lg font-semibold ${textPrimary} mb-4`}>🌐 信息来源分布</h2>
          <div className={`${cardBg} border ${borderColor} rounded-lg p-6`}>
            <div className="flex flex-wrap gap-2">
              {source_counts.map((source) => (
                <div
                  key={source.source}
                  className={`px-3 py-2 rounded-lg ${isDark ? "bg-gray-700" : "bg-gray-100"}`}
                >
                  <span className={`text-sm ${textPrimary}`}>{source.source}</span>
                  <span className={`text-xs ${textSecondary} ml-2`}>{source.count}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}