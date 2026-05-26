"use client";

import { TrendingTopic, CategorySourceDiversity, ScoreBreakdownStats } from "@/lib/api";

interface ContextPanelProps {
  trendingTopics: TrendingTopic[];
  sourceDiversity: CategorySourceDiversity[];
  scoreDistribution: ScoreBreakdownStats;
  theme?: "dark" | "light";
  // Optional: selected content for graph mini preview
  selectedContent?: {
    title?: string;
    categories?: string[];
  };
}

function getStatusIcon(status: string) {
  switch (status) {
    case "rising": return "↑";
    case "falling": return "↓";
    default: return "→";
  }
}

function getStatusColor(status: string) {
  switch (status) {
    case "rising": return "text-green-500";
    case "falling": return "text-red-500";
    default: return "text-yellow-500";
  }
}

// Mini Graph Preview Component
function MiniGraphPreview({ topics, theme }: { topics: TrendingTopic[]; theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-600";

  if (topics.length === 0) {
    return (
      <div className={`text-xs ${textSecondary} text-center py-4`}>
        暂无图谱数据
      </div>
    );
  }

  // Build a simple tree visualization
  const topTopics = topics.slice(0, 4);

  return (
    <div className="space-y-2">
      {topTopics.map((topic, i) => (
        <div key={topic.topic} className="relative">
          {/* Node */}
          <div className={`flex items-center gap-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                topic.status === "rising" ? "bg-green-500/20 text-green-400" :
                topic.status === "falling" ? "bg-red-500/20 text-red-400" :
                "bg-yellow-500/20 text-yellow-400"
              }`}
            >
              {i + 1}
            </div>
            <span className="text-xs truncate max-w-[100px]">{topic.topic}</span>
          </div>
          {/* Simple connections */}
          {i < topTopics.length - 1 && (
            <div
              className={`absolute left-3 top-6 w-0.5 h-4 ${isDark ? "bg-gray-600" : "bg-gray-300"}`}
              style={{ transform: 'translateX(5px)' }}
            />
          )}
        </div>
      ))}
      <div className={`mt-3 pt-2 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
        <div className="flex items-center justify-between">
          <span className={`text-xs ${textSecondary}`}>图谱趋势</span>
          <span className={`text-xs ${textPrimary}`}>↑ 趋势上升</span>
        </div>
      </div>
    </div>
  );
}

export default function ContextPanel({
  trendingTopics,
  sourceDiversity,
  scoreDistribution,
  theme = "dark",
  selectedContent,
}: ContextPanelProps) {
  const isDark = theme === "dark";

  const panelBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-600";
  const textMuted = isDark ? "text-gray-500" : "text-gray-400";

  return (
    <div className="flex flex-col gap-4 w-80">
      {/* Mini Graph Preview */}
      <div className={`${panelBg} border ${borderColor} rounded-lg p-4`}>
        <h3 className={`font-semibold text-sm ${textPrimary} mb-3 flex items-center gap-2`}>
          🧠 知识图谱预览
        </h3>
        {selectedContent?.title ? (
          <div className="space-y-2">
            <div className={`text-xs ${textPrimary} font-medium truncate`} title={selectedContent.title}>
              {selectedContent.title}
            </div>
            {selectedContent.categories && selectedContent.categories.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedContent.categories.map((cat) => (
                  <span
                    key={cat}
                    className={`text-xs px-2 py-0.5 rounded ${
                      isDark ? "bg-blue-500/20 text-blue-400" : "bg-blue-100 text-blue-600"
                    }`}
                  >
                    {cat}
                  </span>
                ))}
              </div>
            )}
            <div className={`mt-2 text-xs ${textMuted}`}>
              相关实体 · 关系 · 共现
            </div>
          </div>
        ) : (
          <MiniGraphPreview topics={trendingTopics} theme={theme} />
        )}
      </div>

      {/* Score Distribution */}
      <div className={`${panelBg} border ${borderColor} rounded-lg p-4`}>
        <h3 className={`font-semibold text-sm ${textPrimary} mb-3`}>
          📊 深耕/扩展/探索比例
        </h3>
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className={`text-xs ${textSecondary}`}>深耕 (Exploit)</span>
            <span className={`font-mono text-xs ${textPrimary}`}>
              {scoreDistribution.avg_exploit.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className={`text-xs ${textSecondary}`}>扩展 (Expand)</span>
            <span className={`font-mono text-xs ${textPrimary}`}>
              {scoreDistribution.avg_expand.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className={`text-xs ${textSecondary}`}>探索 (Explore)</span>
            <span className={`font-mono text-xs ${textPrimary}`}>
              {scoreDistribution.avg_explore.toFixed(2)}
            </span>
          </div>
        </div>
        <div className="mt-3 h-2 bg-gray-700 rounded-full overflow-hidden flex">
          <div
            className="bg-blue-500 h-full"
            style={{ width: `${scoreDistribution.avg_exploit * 100}%` }}
          />
          <div
            className="bg-green-500 h-full"
            style={{ width: `${scoreDistribution.avg_expand * 100}%` }}
          />
          <div
            className="bg-purple-500 h-full"
            style={{ width: `${scoreDistribution.avg_explore * 100}%` }}
          />
        </div>
      </div>

      {/* Trending Topics */}
      <div className={`${panelBg} border ${borderColor} rounded-lg p-4`}>
        <h3 className={`font-semibold text-sm ${textPrimary} mb-3`}>
          🔥 本周热点主题
        </h3>
        <div className="space-y-3">
          {trendingTopics.length === 0 ? (
            <p className={`text-xs ${textMuted}`}>暂无数据</p>
          ) : (
            trendingTopics.slice(0, 5).map((topic) => (
              <div key={topic.topic} className="flex justify-between items-center">
                <span className={`text-xs ${textSecondary} truncate max-w-[140px]`}>
                  {topic.topic}
                </span>
                <span className={`text-xs ${getStatusColor(topic.status)}`}>
                  {getStatusIcon(topic.status)} {topic.status === "rising" ? "上升" : topic.status === "falling" ? "下降" : "稳定"}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Source Diversity */}
      <div className={`${panelBg} border ${borderColor} rounded-lg p-4`}>
        <h3 className={`font-semibold text-sm ${textPrimary} mb-3`}>
          🌐 信息源多样性
        </h3>
        <div className="space-y-3">
          {sourceDiversity.length === 0 ? (
            <p className={`text-xs ${textMuted}`}>暂无数据</p>
          ) : (
            sourceDiversity.slice(0, 3).map((item) => (
              <div key={item.category}>
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-xs ${textSecondary} truncate max-w-[140px]`}>
                    {item.category}
                  </span>
                  <span className={`text-xs ${textMuted}`}>
                    {item.coverage_ratio > 0 ? `覆盖 ${(item.coverage_ratio * 100).toFixed(0)}%` : "无覆盖"}
                  </span>
                </div>
                <div className={`text-xs ${textMuted}`}>
                  {item.missing_sources.length > 0 ? (
                    <span className="text-red-400">
                      缺 {item.missing_sources.slice(0, 2).join(", ")}
                      {item.missing_sources.length > 2 && ` +${item.missing_sources.length - 2}`}
                    </span>
                  ) : (
                    <span className="text-green-400">全覆盖</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}