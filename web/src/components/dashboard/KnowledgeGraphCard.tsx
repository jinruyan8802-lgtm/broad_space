"use client";
import { KnowledgeGraphStats } from "@/lib/api";

interface KnowledgeGraphCardProps {
  graph: KnowledgeGraphStats;
  theme?: "dark" | "light";
}

export default function KnowledgeGraphCard({ graph, theme = "light" }: KnowledgeGraphCardProps) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const itemBg = isDark ? "bg-[#222]" : "bg-gray-50";

  const metrics = [
    { value: graph.nodes.toLocaleString(), label: "节点总数", color: "text-purple-400" },
    { value: graph.edges.toLocaleString(), label: "关系边数", color: "text-purple-400" },
    { value: `+${graph.today_new_nodes}`, label: "今日新增节点", color: "text-green-400" },
    { value: `+${graph.today_new_edges}`, label: "今日新增关系", color: "text-green-400" },
  ];

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <h3 className="font-semibold text-sm mb-3">🧠 知识图谱</h3>
      <div className="grid grid-cols-2 gap-2">
        {metrics.map((m) => (
          <div key={m.label} className={`${itemBg} rounded p-3 text-center`}>
            <div className={`text-xl font-bold ${m.color}`}>{m.value}</div>
            <div className={`text-[10px] mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>{m.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
