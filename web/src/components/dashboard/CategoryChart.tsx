"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { CategoryCount } from "@/lib/api";

export default function CategoryChart({ data, theme = "light" }: { data: CategoryCount[]; theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const gridStroke = isDark ? "#333" : "#f0f0f0";
  const tickColor = isDark ? "#9ca3af" : "#6b7280";
  const tooltipBg = isDark ? "#1a1a2e" : "#fff";
  const tooltipBorder = isDark ? "1px solid #333" : "1px solid #e5e7eb";

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <h3 className="font-semibold text-sm mb-3">分类统计 Top 10</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis type="number" tick={{ fontSize: 11, fill: tickColor }} />
            <YAxis dataKey="category" type="category" tick={{ fontSize: 10, fill: tickColor }} width={100} />
            <Tooltip contentStyle={{ background: tooltipBg, border: tooltipBorder, borderRadius: 6, fontSize: 12 }} />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
