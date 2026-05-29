"use client";

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  theme?: "dark" | "light";
}

export default function Pagination({ page, totalPages, onPageChange, theme = "dark" }: PaginationProps) {
  if (totalPages <= 1) return null;

  const isDark = theme === "dark";

  const getPageNumbers = (): (number | "ellipsis")[] => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }

    const pages: (number | "ellipsis")[] = [1];

    if (page > 3) {
      pages.push("ellipsis");
    }

    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    if (page < totalPages - 2) {
      pages.push("ellipsis");
    }

    pages.push(totalPages);

    return pages;
  };

  const btnBase = `px-3 py-1.5 text-sm rounded border transition-colors`;
  const btnActive = "bg-blue-600 text-white border-blue-600";
  const btnInactive = isDark
    ? "bg-[#1a1a2e] text-gray-300 border-gray-600 hover:border-blue-400"
    : "bg-white text-gray-700 border-gray-200 hover:border-blue-400";
  const btnDisabled = isDark
    ? "bg-[#1a1a2e] text-gray-600 border-gray-700 cursor-not-allowed"
    : "bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed";

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} ${page <= 1 ? btnDisabled : btnInactive}`}
      >
        ← 上一页
      </button>

      {getPageNumbers().map((p, i) =>
        p === "ellipsis" ? (
          <span key={`e${i}`} className={`px-2 text-sm ${isDark ? "text-gray-500" : "text-gray-400"}`}>
            ...
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`${btnBase} ${p === page ? btnActive : btnInactive}`}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={`${btnBase} ${page >= totalPages ? btnDisabled : btnInactive}`}
      >
        下一页 →
      </button>
    </div>
  );
}
