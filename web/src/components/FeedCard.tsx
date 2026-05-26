"use client";

import { ScoreBreakdown } from "@/lib/api";

interface FeedCardProps {
  id: string;
  title: string;
  url: string;
  summary: string;
  categories: string[];
  signal_strength: number;
  sentiment: string;
  sources: { name: string; url: string }[];
  key_points?: string[];
  final_score?: number;
  score_breakdown?: ScoreBreakdown;
  theme?: "dark" | "light";
  isSelected?: boolean;
  onClick?: () => void;
}

export default function FeedCard({
  title,
  summary,
  categories,
  signal_strength,
  sentiment,
  sources,
  key_points,
  final_score,
  score_breakdown,
  theme = "dark",
  isSelected = false,
  onClick,
}: FeedCardProps) {
  const isDark = theme === "dark";

  const signalColor = signal_strength >= 0.8
    ? "text-red-500"
    : signal_strength >= 0.5
    ? "text-yellow-500"
    : "text-blue-500";

  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const textPrimary = isDark ? "text-gray-100" : "text-gray-900";
  const textSecondary = isDark ? "text-gray-400" : "text-gray-600";
  const textMuted = isDark ? "text-gray-500" : "text-gray-400";

  const selectedBorder = isSelected ? "border-blue-500 border-2" : borderColor;

  const getSignalLabel = () => {
    if (signal_strength >= 0.8) return "范式信号";
    if (signal_strength >= 0.5) return "值得关注";
    return "探索发现";
  };

  const getSignalBadgeColor = () => {
    if (signal_strength >= 0.8) return "bg-red-500/20 text-red-400 border border-red-500/30";
    if (signal_strength >= 0.5) return "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30";
    return "bg-blue-500/20 text-blue-400 border border-blue-500/30";
  };

  return (
    <div
      className={`${cardBg} ${selectedBorder} rounded-lg p-4 hover:shadow-md transition cursor-pointer`}
      onClick={onClick}
    >
      <div className="flex justify-between items-start gap-4">
        <h2 className={`text-base font-semibold ${textPrimary} flex-1`}>{title}</h2>
        <div className="flex flex-col items-end gap-1">
          <span className={`font-bold text-lg ${signalColor}`}>{signal_strength.toFixed(2)}</span>
          <span className={`text-xs ${textMuted}`}>{final_score?.toFixed(2) || signal_strength.toFixed(2)}</span>
        </div>
      </div>

      <p className={`${textSecondary} mt-2 text-sm`}>{summary}</p>

      {/* Badges */}
      <div className="flex gap-2 mt-3 flex-wrap">
        <span className={getSignalBadgeColor()}>
          {getSignalLabel()}
        </span>
        {categories.map((c) => (
          <span
            key={c}
            className={`text-xs px-2 py-1 rounded ${isDark ? "bg-gray-700 text-gray-300" : "bg-gray-100 text-gray-600"}`}
          >
            {c}
          </span>
        ))}
      </div>

      {/* Score Breakdown */}
      {score_breakdown && (
        <div className={`mt-3 flex gap-3 text-xs ${textMuted}`}>
          <span>深耕 {Math.round(score_breakdown.exploit * 100)}%</span>
          <span>扩展 {Math.round(score_breakdown.expand * 100)}%</span>
          <span>探索 {Math.round(score_breakdown.explore * 100)}%</span>
        </div>
      )}

      {/* Key Points */}
      {key_points && key_points.length > 0 && (
        <div className={`mt-3 space-y-1 ${textSecondary}`}>
          {key_points.slice(0, 3).map((point, i) => (
            <div key={i} className="flex gap-2 text-xs">
              <span className={isDark ? "text-gray-500" : "text-gray-400"}>•</span>
              <span>{point}</span>
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className={`flex items-center gap-4 mt-3 text-xs ${textMuted}`}>
        <span>情绪: {sentiment}</span>
        <span className="truncate">
          来源: {sources.map((s) => s.name).join(", ")}
        </span>
        {isSelected && (
          <span className="text-blue-400 ml-auto">✓ 已选中</span>
        )}
      </div>
    </div>
  );
}