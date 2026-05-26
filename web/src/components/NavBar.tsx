"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ActiveTab = "feed" | "graph" | "dashboard" | "signal" | "trend" | "search";

const NAV_ITEMS = [
  { key: "feed" as const, href: "/", label: "Feed" },
  { key: "graph" as const, href: "/graph", label: "图谱" },
  { key: "signal" as const, href: "/signal", label: "信号" },
  { key: "trend" as const, href: "/trend", label: "趋势" },
  { key: "dashboard" as const, href: "/dashboard", label: "面板" },
  { key: "search" as const, href: "/search", label: "搜索" },
];

export default function NavBar({ active }: { active?: ActiveTab }) {
  const pathname = usePathname();
  const current = active ?? "feed";

  return (
    <nav className="flex items-center justify-between px-6 py-3 border-b border-b-gray-200 bg-white">
      {/* Logo */}
      <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
        <span className="text-xl">🔭</span>
        <span className="text-sm font-bold text-gray-900 hidden sm:inline">BroadSpace</span>
      </Link>

      {/* Navigation Links */}
      <div className="flex items-center gap-1">
        {NAV_ITEMS.map(({ key, href, label }) => (
          <Link
            key={key}
            href={href}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              current === key
                ? "bg-blue-50 text-blue-600 font-semibold"
                : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>

      {/* Right side - date display */}
      <div className="hidden md:block text-xs text-gray-400">
        {new Date().toLocaleDateString("zh-CN", { month: "short", day: "numeric", weekday: "short" })}
      </div>
    </nav>
  );
}