"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type ActiveTab = "feed" | "graph" | "dashboard";

export default function NavBar({ active }: { active?: ActiveTab }) {
  const pathname = usePathname();
  const current = active ?? "feed";

  return (
    <nav className="flex items-center gap-1 px-6 py-3 border-b border-b-gray-200 bg-white">
      <span className="text-sm font-bold text-gray-900 mr-2">BroadSpace</span>
      <Link
        href="/"
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          current === "feed"
            ? "bg-blue-50 text-blue-600 font-semibold"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        Feed
      </Link>
      <Link
        href="/graph"
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          current === "graph"
            ? "bg-blue-50 text-blue-600 font-semibold"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        Knowledge Graph
      </Link>
      <Link
        href="/dashboard"
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          current === "dashboard"
            ? "bg-blue-50 text-blue-600 font-semibold"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        Dashboard
      </Link>
    </nav>
  );
}
