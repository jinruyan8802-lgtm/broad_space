"use client";
import { SignalDistribution, ScoreBreakdownStats } from "@/lib/api";

interface SignalQualityCardProps {
  signalDistribution: SignalDistribution;
  scoreDistribution: ScoreBreakdownStats;
  theme?: "dark" | "light";
}

export default function SignalQualityCard({ signalDistribution, scoreDistribution, theme = "light" }: SignalQualityCardProps) {
  const isDark = theme === "dark";
  const cardBg = isDark ? "bg-[#1a1a2e]" : "bg-white";
  const borderColor = isDark ? "border-[#333]" : "border-gray-200";
  const borderItem = isDark ? "border-[#333]" : "border-gray-100";
  const textColor = isDark ? "text-gray-100" : "text-gray-900";

  const compositeScore = Math.round(scoreDistribution.avg_final * 100);
  const total = signalDistribution.high + signalDistribution.mid + signalDistribution.low;
  const highPct = total > 0 ? ((signalDistribution.high / total) * 100).toFixed(0) : "0";
  const midPct = total > 0 ? ((signalDistribution.mid / total) * 100).toFixed(0) : "0";
  const lowPct = total > 0 ? ((signalDistribution.low / total) * 100).toFixed(0) : "0";

  return (
    <div className={`${cardBg} rounded-lg border ${borderColor} p-4`}>
      <h3 className={`font-semibold text-sm mb-3 ${textColor}`}>🎯 信号质量</h3>
      <div className="flex flex-col items-center">
        <div className="text-4xl font-bold text-green-400">{compositeScore}</div>
        <div className={`text-xs mt-1 ${isDark ? "text-gray-500" : "text-gray-400"}`}>综合信号分</div>
      </div>
      <div className={`flex justify-around mt-4 pt-3 border-t ${borderItem}`}>
        <div className="text-center">
          <div className="text-red-500 font-bold text-lg">{signalDistribution.high}</div>
          <div className={`text-[10px] ${textColor}`}>🔴 范式信号</div>
        </div>
        <div className="text-center">
          <div className="text-yellow-500 font-bold text-lg">{signalDistribution.mid}</div>
          <div className={`text-[10px] ${textColor}`}>🟡 值得关注</div>
        </div>
        <div className="text-center">
          <div className="text-blue-400 font-bold text-lg">{signalDistribution.low}</div>
          <div className={`text-[10px] ${textColor}`}>🔵 快速扫描</div>
        </div>
      </div>
      <div className={`mt-3 h-2 ${isDark ? "bg-[#222]" : "bg-gray-100"} rounded-full overflow-hidden flex`}>
        <div className="bg-red-500 h-full" style={{ width: `${highPct}%` }} />
        <div className="bg-yellow-500 h-full" style={{ width: `${midPct}%` }} />
        <div className="bg-blue-400 h-full" style={{ width: `${lowPct}%` }} />
      </div>
    </div>
  );
}
