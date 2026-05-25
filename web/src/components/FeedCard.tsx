interface FeedCardProps {
  id: string;
  title: string;
  url: string;
  summary: string;
  categories: string[];
  signal_strength: number;
  sentiment: string;
  sources: { name: string; url: string }[];
}

export default function FeedCard({
  title,
  summary,
  categories,
  signal_strength,
  sentiment,
  sources,
}: FeedCardProps) {
  const signalColor =
    signal_strength >= 0.8
      ? "text-red-500"
      : signal_strength >= 0.5
      ? "text-yellow-500"
      : "text-blue-500";

  return (
    <div className="border rounded-lg p-4 mb-4 shadow-sm hover:shadow-md transition">
      <div className="flex justify-between items-start">
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className={`font-bold ${signalColor}`}>{signal_strength.toFixed(2)}</span>
      </div>
      <p className="text-gray-600 mt-2 text-sm">{summary}</p>
      <div className="flex gap-2 mt-3 flex-wrap">
        {categories.map((c) => (
          <span key={c} className="bg-gray-100 text-xs px-2 py-1 rounded">
            {c}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
        <span>Sentiment: {sentiment}</span>
        <span>
          Sources: {sources.map((s) => s.name).join(", ")}
        </span>
      </div>
    </div>
  );
}