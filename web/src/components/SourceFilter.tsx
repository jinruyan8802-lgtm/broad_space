"use client";

const SOURCES = [
  { key: "hackernews", label: "Hacker News" },
  { key: "github_trending", label: "GitHub Trending" },
  { key: "arxiv", label: "ArXiv" },
  { key: "v2ex", label: "V2EX" },
  { key: "miniflux", label: "RSS/Miniflux" },
  { key: "juejin", label: "掘金" },
  { key: "lobsters", label: "Lobsters" },
  { key: "devto", label: "Dev.to" },
  { key: "kr36", label: "36Kr" },
];

interface SourceFilterProps {
  activeSources: string[];
  onChange: (sources: string[]) => void;
  theme?: "dark" | "light";
}

export default function SourceFilter({ activeSources, onChange, theme = "dark" }: SourceFilterProps) {
  const isDark = theme === "dark";

  const toggle = (key: string) => {
    if (activeSources.includes(key)) {
      onChange(activeSources.filter((s) => s !== key));
    } else {
      onChange([...activeSources, key]);
    }
  };

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {SOURCES.map((src) => (
        <label
          key={src.key}
          className={`flex items-center gap-1.5 text-sm cursor-pointer select-none ${
            isDark ? "text-gray-300" : "text-gray-700"
          }`}
        >
          <input
            type="checkbox"
            checked={activeSources.includes(src.key)}
            onChange={() => toggle(src.key)}
            className="accent-blue-600"
          />
          {src.label}
        </label>
      ))}
      {activeSources.length > 0 && (
        <button
          onClick={() => onChange([])}
          className={`text-xs px-2 py-0.5 rounded border ${
            isDark
              ? "text-gray-400 border-gray-600 hover:border-gray-400"
              : "text-gray-500 border-gray-300 hover:border-gray-500"
          }`}
        >
          清除
        </button>
      )}
    </div>
  );
}
