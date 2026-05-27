"use client";
import { SourceHealthItem } from "@/lib/api";

function relativeTime(isoStr: string | null): string {
  if (!isoStr) return "从未";
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  return `${days} 天前`;
}

export default function SourceHealthPanel({ data, theme = "light" }: { data: SourceHealthItem[]; theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const itemBg = isDark ? "bg-[#222]" : "bg-gray-50";
  const textSecondary = isDark ? "text-gray-500" : "text-gray-400";

  const statusColors: Record<string, string> = {
    online: "bg-green-500",
    stale: "bg-yellow-500",
    offline: "bg-red-500",
  };

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <h3 className="font-semibold text-sm mb-3">🔌 数据源健康</h3>
      <div className="grid grid-cols-3 gap-2">
        {data.map((item) => (
          <div key={item.source} className={`${itemBg} rounded p-2 flex items-center gap-2`}>
            <span className={`w-2 h-2 rounded-full ${statusColors[item.status]}`} />
            <div className="min-w-0">
              <div className="text-xs font-medium truncate">{item.source}</div>
              <div className={`text-[10px] ${textSecondary}`}>{relativeTime(item.last_seen)}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
