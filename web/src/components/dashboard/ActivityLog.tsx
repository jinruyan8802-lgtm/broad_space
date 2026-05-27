"use client";
import { RecentActivity } from "@/lib/api";

function relativeTime(isoStr: string): string {
  if (!isoStr) return "";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function ActivityLog({ data, theme = "light" }: { data: RecentActivity[]; theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const textSecondary = isDark ? "text-gray-500" : "text-gray-400";
  const monospaceText = isDark ? "text-gray-400" : "text-gray-600";

  const signalColor = (s: number) => {
    if (s >= 0.8) return "text-red-400";
    if (s >= 0.5) return "text-yellow-400";
    return "text-blue-400";
  };

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <h3 className="font-semibold text-sm mb-3">📋 最近活动</h3>
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {data.map((item, i) => (
          <div key={i} className="flex items-start gap-2 text-xs">
            <span className={`text-[10px] ${textSecondary} w-14 flex-shrink-0 text-right`}>
              {relativeTime(item.processed_at)}
            </span>
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${signalColor(item.signal_strength).replace("text-", "bg-")}`} />
            <div className="min-w-0">
              <span className="text-[10px] text-blue-400">{item.source}</span>
              <span className={`mx-1 ${textSecondary}`}>·</span>
              <span className={monospaceText}>{item.title.length > 40 ? item.title.slice(0, 40) + "…" : item.title}</span>
            </div>
          </div>
        ))}
        {data.length === 0 && (
          <div className={`text-xs ${textSecondary} text-center py-4`}>暂无活动记录</div>
        )}
      </div>
    </div>
  );
}
