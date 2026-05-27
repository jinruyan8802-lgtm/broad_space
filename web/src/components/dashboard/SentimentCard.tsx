"use client";
import { SentimentCounts } from "@/lib/api";

export default function SentimentCard({ data, theme = "light" }: { data: SentimentCounts; theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";

  const total = data.positive + data.neutral + data.negative;

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <h3 className="font-semibold text-sm mb-3">情感分布</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span>😊 Positive</span>
          <span className="font-mono">{data.positive}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>😐 Neutral</span>
          <span className="font-mono">{data.neutral}</span>
        </div>
        <div className="flex items-center justify-between">
          <span>😔 Negative</span>
          <span className="font-mono">{data.negative}</span>
        </div>
      </div>
      {total > 0 && (
        <div className="mt-3 flex gap-1 h-2 rounded-full overflow-hidden">
          <div className="bg-green-500 h-full" style={{ width: `${(data.positive/total*100).toFixed(1)}%` }} />
          <div className="bg-gray-400 h-full" style={{ width: `${(data.neutral/total*100).toFixed(1)}%` }} />
          <div className="bg-red-400 h-full" style={{ width: `${(data.negative/total*100).toFixed(1)}%` }} />
        </div>
      )}
    </div>
  );
}
