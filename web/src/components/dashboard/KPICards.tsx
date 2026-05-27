"use client";

interface KPICardsProps {
  todayArticles: number;
  totalArticles: number;
  graphNodes: number;
  graphEdges: number;
  onlineSources: number;
  totalSources: number;
  theme?: "dark" | "light";
}

export default function KPICards({
  todayArticles,
  totalArticles,
  graphNodes,
  graphEdges,
  onlineSources,
  totalSources,
  theme = "light",
}: KPICardsProps) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const subText = isDark ? "text-gray-500" : "text-gray-400";

  const cards = [
    { value: todayArticles, label: "今日采集", sub: `共 ${totalArticles.toLocaleString()} 条`, color: "text-blue-400" },
    { value: totalArticles.toLocaleString(), label: "总文章数", sub: "所有时间", color: "text-green-400" },
    { value: graphNodes.toLocaleString(), label: "知识节点", sub: `+${todayArticles} 今日`, color: "text-purple-400" },
    { value: graphEdges.toLocaleString(), label: "知识关系", sub: "Entity → RELATES → Entity", color: "text-cyan-400" },
    { value: `${onlineSources}/${totalSources}`, label: "数据源在线", sub: onlineSources === totalSources ? "全部正常" : "部分离线", color: "text-orange-400" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {cards.map((card) => (
        <div key={card.label} className={`${cardBg} border ${borderColor} rounded-lg p-4 text-center`}>
          <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
          <div className="text-sm mt-1">{card.label}</div>
          <div className={`text-xs mt-1 ${subText}`}>{card.sub}</div>
        </div>
      ))}
    </div>
  );
}
