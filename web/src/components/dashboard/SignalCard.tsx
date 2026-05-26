"use client";
import { SignalDistribution } from "@/lib/api";

export default function SignalCard({ data }: { data: SignalDistribution }) {
  const total = data.high + data.mid + data.low;
  const highPct = total > 0 ? ((data.high / total) * 100).toFixed(1) : "0";
  const midPct = total > 0 ? ((data.mid / total) * 100).toFixed(1) : "0";
  const lowPct = total > 0 ? ((data.low / total) * 100).toFixed(1) : "0";

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="font-semibold text-sm mb-3">Signal 分布</h3>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><span className="text-red-500">🔴</span> 高 (≥0.8)</span>
          <span className="font-mono">{data.high} <span className="text-gray-400 text-xs">({highPct}%)</span></span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><span className="text-yellow-500">🟡</span> 中 (0.5-0.8)</span>
          <span className="font-mono">{data.mid} <span className="text-gray-400 text-xs">({midPct}%)</span></span>
        </div>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1"><span className="text-blue-500">🔵</span> 低 (&lt;0.5)</span>
          <span className="font-mono">{data.low} <span className="text-gray-400 text-xs">({lowPct}%)</span></span>
        </div>
      </div>
      <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden flex">
        <div className="bg-red-500 h-full" style={{ width: `${highPct}%` }} />
        <div className="bg-yellow-500 h-full" style={{ width: `${midPct}%` }} />
        <div className="bg-blue-500 h-full" style={{ width: `${lowPct}%` }} />
      </div>
    </div>
  );
}
