"use client";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { VolumeDataPoint } from "@/lib/api";

export default function CollectionTrendChart({ data, theme = "light" }: { data: VolumeDataPoint[]; theme?: "dark" | "light" }) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const gridStroke = isDark ? "#333" : "#f0f0f0";
  const tickColor = isDark ? "#9ca3af" : "#6b7280";
  const tooltipBg = isDark ? "#1a1a2e" : "#fff";
  const tooltipBorder = isDark ? "1px solid #333" : "1px solid #e5e7eb";
  const textColor = isDark ? "text-gray-100" : "text-gray-900";

  const avg = data.length > 0 ? Math.round(data.reduce((s, d) => s + d.count, 0) / data.length) : 0;

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={`font-semibold text-sm ${textColor}`}>📈 7 日采集趋势</h3>
        <span className={`text-xs ${isDark ? "text-gray-500" : "text-gray-400"}`}>日均 {avg} 条</span>
      </div>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: tickColor }} />
            <YAxis tick={{ fontSize: 10, fill: tickColor }} width={50} />
            <Tooltip contentStyle={{ background: tooltipBg, border: tooltipBorder, borderRadius: 6, fontSize: 12 }} />
            <Area type="monotone" dataKey="count" stroke="#4fc3f7" fill="#4fc3f7" fillOpacity={0.15} strokeWidth={2} dot={{ r: 3 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
