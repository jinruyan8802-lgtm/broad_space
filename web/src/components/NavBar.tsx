"use client";

import Link from "next/link";
import { useRouter } from "next/router";

export default function NavBar() {
  const router = useRouter();
  const isGraph = router.pathname === "/graph";
  const active = isGraph ? "graph" : "feed";

  return (
    <nav className="flex items-center gap-1 px-6 py-3 border-b border-gray-200 bg-white">
      <span className="text-sm font-bold text-gray-900 mr-2">BroadSpace</span>
      <Link
        href="/"
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          active === "feed"
            ? "bg-blue-50 text-blue-600 font-semibold"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        Feed
      </Link>
      <Link
        href="/graph"
        className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
          active === "graph"
            ? "bg-blue-50 text-blue-600 font-semibold"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        Knowledge Graph
      </Link>
    </nav>
  );
}