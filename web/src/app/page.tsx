"use client";

import { useState, useEffect, useCallback } from "react";
import FeedCard from "@/components/FeedCard";
import { fetchContent } from "@/lib/api";

const CATEGORIES = [
  "AI/ML",
  "Infrastructure",
  "Programming Languages",
  "Security",
  "Frontend",
  "Mobile",
  "Database",
  "DevOps",
  "Open Source",
  "Academic",
];

export default function Home() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchContent({
        limit: 30,
        ...(activeCategory ? { category: activeCategory } : {}),
      });
      setItems(data);
    } catch (e: any) {
      setError(e.message || "Failed to load content");
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  useEffect(() => {
    load();
  }, [load]);

  // Auto-refresh every 60 seconds
  useEffect(() => {
    const interval = setInterval(load, 60_000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <main className="max-w-3xl mx-auto p-6">
      {/* Category filter chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1 text-sm rounded-full border transition-colors ${
            activeCategory === null
              ? "bg-blue-600 text-white border-blue-600"
              : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-3 py-1 text-sm rounded-full border transition-colors ${
              activeCategory === cat
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-gray-600 border-gray-200 hover:border-blue-400"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading && items.length === 0 ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : error ? (
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          Error: {error}
        </div>
      ) : items.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No content yet. Run the pipeline to populate.
        </p>
      ) : (
        <div className="space-y-4">
          {items.map((a) => (
            <FeedCard key={a.id} {...a} />
          ))}
        </div>
      )}
    </main>
  );
}