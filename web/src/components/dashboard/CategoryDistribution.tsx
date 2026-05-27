"use client";
import { CategoryCount } from "@/lib/api";

const CATEGORY_COLORS: Record<string, string> = {
  "AI/ML": "#4fc3f7",
  Infrastructure: "#81c784",
  "Programming Languages": "#ffb74d",
  Security: "#ef5350",
  Frontend: "#ff8a65",
  Mobile: "#7986cb",
  Database: "#4db6ac",
  DevOps: "#a1887f",
  "Open Source": "#81c784",
  Academic: "#ce93d8",
};

export default function CategoryDistribution({ data, theme = "light" }: { data: CategoryCount[]; theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const barBg = isDark ? "bg-[#222]" : "bg-gray-100";
  const textSecondary = isDark ? "text-gray-500" : "text-gray-400";

  const maxCount = data.length > 0 ? Math.max(...data.map((d) => d.count)) : 1;

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <h3 className="font-semibold text-sm mb-3">🏷️ 分类分布</h3>
      <div className="space-y-2">
        {data.slice(0, 8).map((item) => {
          const pct = ((item.count / maxCount) * 100).toFixed(0);
          const color = CATEGORY_COLORS[item.category] || "#3b82f6";
          return (
            <div key={item.category} className="flex items-center gap-2">
              <span className="text-xs w-28 truncate text-right" style={{ color }}>{item.category}</span>
              <div className={`flex-1 h-1.5 ${barBg} rounded-full overflow-hidden`}>
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
              </div>
              <span className={`text-xs w-8 text-right ${textSecondary}`}>{item.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
