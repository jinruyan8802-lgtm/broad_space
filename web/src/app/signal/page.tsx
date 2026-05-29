"use client";

import { useState, useEffect } from "react";
import { fetchAnalytics, fetchContent, ContentItem, AnalyticsResponse } from "@/lib/api";

export default function SignalPage() {
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [contents, setContents] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState<"dark" | "light">("dark");

  useEffect(() => {
    Promise.all([
      fetchAnalytics(7),
      fetchContent({ limit: 50 }),
    ]).then(([analyticsData, contentData]) => {
      setAnalytics(analyticsData);
      setContents(contentData.items);
    }).catch(console.error)
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

  const { signal_distribution, score_distribution, category_counts } = analytics;
  const totalSignals = signal_distribution.high + signal_distribution.mid + signal_distribution.low;

  return (
    <div className={`${bgColor} min-h-screen`}>
      {/* Header */}
      <header className={`${cardBg} border-b ${borderColor} px-6 py-3`}>
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className={`text-xl font-bold ${textPrimary}`}>🔮 信号视图</h1>
          <button
            onClick={() => setTheme(isDark ? "light" : "dark")}
            className={`text-sm px-3 py-1 rounded border ${borderColor} ${textPrimary} hover:opacity-80`}
          >
            {isDark ? "☀️ 浅色" : "🌙 暗色"}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {/* Signal Distribution Overview */}
        <section className="mb-8">
          <h2 className={`text-lg font-semibold ${textPrimary} mb-4`}>📊 信号强度分布</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Total */}
            <div className={`${cardBg} border ${borderColor} rounded-lg p-6 text-center`}>
              <div className={`text-4xl font-bold ${textPrimary}`}>{totalSignals}</div>
              <div className={`text-sm ${textSecondary} mt-1`}>总文章数</div>
            </div>

            {/* High Signal */}
            <div className={`${cardBg} border ${borderColor} rounded-lg p-6 text-center`}>
              <div className="text-4xl font-bold text-red-500">{signal_distribution.high}</div>
              <div className={`text-sm ${textSecondary} mt-1`}>🔴 范式信号 (≥0.8)</div>
              <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="bg-red-500 h-full"
                  style={{ width: `${totalSignals > 0 ? (signal_distribution.high / totalSignals * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Mid Signal */}
            <div className={`${cardBg} border ${borderColor} rounded-lg p-6 text-center`}>
              <div className="text-4xl font-bold text-yellow-500">{signal_distribution.mid}</div>
              <div className={`text-sm ${textSecondary} mt-1`}>🟡 值得关注 (0.5-0.8)</div>
              <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="bg-yellow-500 h-full"
                  style={{ width: `${totalSignals > 0 ? (signal_distribution.mid / totalSignals * 100) : 0}%` }}
                />
              </div>
            </div>

            {/* Low Signal */}
            <div className={`${cardBg} border ${borderColor} rounded-lg p-6 text-center`}>
              <div className="text-4xl font-bold text-blue-500">{signal_distribution.low}</div>
              <div className={`text-sm ${textSecondary} mt-1`}>🔵 探索发现 (&lt;0.5)</div>
              <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="bg-blue-500 h-full"
                  style={{ width: `${totalSignals > 0 ? (signal_distribution.low / totalSignals * 100) : 0}%` }}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Score Breakdown */}
        <section className="mb-8">
          <h2 className={`text-lg font-semibold ${textPrimary} mb-4`}>📈 深耕/扩展/探索 分布</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div className={`${cardBg} border ${borderColor} rounded-lg p-6`}>
              <h3 className={`font-semibold ${textPrimary} mb-4`}>比例条</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className={`text-sm ${textSecondary}`}>深耕 (Exploit)</span>
                    <span className={`text-sm ${textPrimary}`}>{(score_distribution.avg_exploit * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                    <div className="bg-blue-500 h-full" style={{ width: `${score_distribution.avg_exploit * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className={`text-sm ${textSecondary}`}>扩展 (Expand)</span>
                    <span className={`text-sm ${textPrimary}`}>{(score_distribution.avg_expand * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                    <div className="bg-green-500 h-full" style={{ width: `${score_distribution.avg_expand * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between mb-1">
                    <span className={`text-sm ${textSecondary}`}>探索 (Explore)</span>
                    <span className={`text-sm ${textPrimary}`}>{(score_distribution.avg_explore * 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-4 bg-gray-700 rounded-full overflow-hidden">
                    <div className="bg-purple-500 h-full" style={{ width: `${score_distribution.avg_explore * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Pie Chart Placeholder */}
            <div className={`${cardBg} border ${borderColor} rounded-lg p-6`}>
              <h3 className={`font-semibold ${textPrimary} mb-4`}>占比环形图</h3>
              <div className="flex items-center justify-center h-48">
                <svg viewBox="0 0 100 100" className="w-48 h-48 transform -rotate-90">
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#3b82f6" strokeWidth="20"
                    strokeDasharray={`${score_distribution.avg_exploit * 251.2} ${251.2 - score_distribution.avg_exploit * 251.2}`}
                    strokeDashoffset="0"
                  />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#22c55e" strokeWidth="20"
                    strokeDasharray={`${score_distribution.avg_expand * 251.2} ${251.2 - score_distribution.avg_expand * 251.2}`}
                    strokeDashoffset={`${-score_distribution.avg_exploit * 251.2}`}
                  />
                  <circle cx="50" cy="50" r="40" fill="none" stroke="#a855f7" strokeWidth="20"
                    strokeDasharray={`${score_distribution.avg_explore * 251.2} ${251.2 - score_distribution.avg_explore * 251.2}`}
                    strokeDashoffset={`${-(score_distribution.avg_exploit + score_distribution.avg_expand) * 251.2}`}
                  />
                </svg>
                <div className={`absolute flex flex-col gap-1 text-xs ${textSecondary}`}>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-blue-500"></span>深耕</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-green-500"></span>扩展</span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-purple-500"></span>探索</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Category Breakdown */}
        <section>
          <h2 className={`text-lg font-semibold ${textPrimary} mb-4`}>📂 分类信号分布</h2>
          <div className={`${cardBg} border ${borderColor} rounded-lg p-6`}>
            <div className="space-y-3">
              {category_counts.map((cat) => {
                const catContents = contents.filter(c => c.categories.includes(cat.category));
                const avgSignal = catContents.length > 0
                  ? catContents.reduce((s, c) => s + c.signal_strength, 0) / catContents.length
                  : 0;
                const signalColor = avgSignal >= 0.8 ? "text-red-500" : avgSignal >= 0.5 ? "text-yellow-500" : "text-blue-500";

                return (
                  <div key={cat.category} className="flex items-center gap-4">
                    <span className={`text-sm ${textSecondary} w-32 truncate`}>{cat.category}</span>
                    <div className="flex-1 h-3 bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${avgSignal >= 0.8 ? "bg-red-500" : avgSignal >= 0.5 ? "bg-yellow-500" : "bg-blue-500"}`}
                        style={{ width: `${avgSignal * 100}%` }}
                      />
                    </div>
                    <span className={`text-sm font-mono ${signalColor}`}>{avgSignal.toFixed(2)}</span>
                    <span className={`text-xs ${textSecondary}`}>({cat.count}篇)</span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}