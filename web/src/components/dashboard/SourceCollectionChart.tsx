"use client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { SourceCount } from "@/lib/api";

const SOURCE_COLORS: Record<string, string> = {
  hackernews: "#4fc3f7",
  github_trending: "#81c784",
  arxiv: "#ce93d8",
  miniflux: "#ffb74d",
  v2ex: "#ef5350",
  kr36: "#4db6ac",
  devto: "#ff8a65",
  lobsters: "#90a4ae",
  juejin: "#a1887f",
};

export default function SourceCollectionChart({ data, theme = "light" }: { data: SourceCount[]; theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const gridStroke = isDark ? "#333" : "#f0f0f0";
  const tickColor = isDark ? "#9ca3af" : "#6b7280";
  const tooltipBg = isDark ? "#1a1a2e" : "#fff";
  const tooltipBorder = isDark ? "1px solid #333" : "1px solid #e5e7eb";

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <h3 className="font-semibold text-sm mb-3">📊 各数据源今日采集量</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis type="number" tick={{ fontSize: 11, fill: tickColor }} />
            <YAxis dataKey="source" type="category" tick={{ fontSize: 11, fill: tickColor }} width={110} />
            <Tooltip contentStyle={{ background: tooltipBg, border: tooltipBorder, borderRadius: 6, fontSize: 12 }} />
            <Bar dataKey="count" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={index} fill={SOURCE_COLORS[entry.source] || "#3b82f6"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
