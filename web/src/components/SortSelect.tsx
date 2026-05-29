"use client";

interface SortOption {
  label: string;
  sortBy: "signal" | "time";
  sortOrder: "asc" | "desc";
}

const SORT_OPTIONS: SortOption[] = [
  { label: "信号强度（高→低）", sortBy: "signal", sortOrder: "desc" },
  { label: "信号强度（低→高）", sortBy: "signal", sortOrder: "asc" },
  { label: "发布时间（新→旧）", sortBy: "time", sortOrder: "desc" },
  { label: "发布时间（旧→新）", sortBy: "time", sortOrder: "asc" },
];

interface SortSelectProps {
  sortBy: "signal" | "time";
  sortOrder: "asc" | "desc";
  onChange: (sortBy: "signal" | "time", sortOrder: "asc" | "desc") => void;
  theme?: "dark" | "light";
}

export default function SortSelect({ sortBy, sortOrder, onChange, theme = "dark" }: SortSelectProps) {
  const isDark = theme === "dark";
  const currentIndex = SORT_OPTIONS.findIndex(
    (o) => o.sortBy === sortBy && o.sortOrder === sortOrder
  );

  return (
    <select
      value={currentIndex}
      onChange={(e) => {
        const opt = SORT_OPTIONS[Number(e.target.value)];
        onChange(opt.sortBy, opt.sortOrder);
      }}
      className={`text-sm px-3 py-1.5 rounded border cursor-pointer ${
        isDark
          ? "bg-[#1a1a2e] text-gray-300 border-gray-600"
          : "bg-white text-gray-700 border-gray-200"
      }`}
    >
      {SORT_OPTIONS.map((opt, i) => (
        <option key={i} value={i}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}
