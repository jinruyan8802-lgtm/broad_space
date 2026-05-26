"use client";
import { useState, useEffect } from "react";
import { fetchAnalytics, AnalyticsResponse } from "@/lib/api";
import SignalCard from "@/components/dashboard/SignalCard";
import SentimentCard from "@/components/dashboard/SentimentCard";
import VolumeChart from "@/components/dashboard/VolumeChart";
import CategoryChart from "@/components/dashboard/CategoryChart";
import SourceChart from "@/components/dashboard/SourceChart";

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAnalytics(7)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg border p-4 h-40 animate-pulse" />
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Analytics</h1>
        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">
          Error: {error}
        </div>
      </main>
    );
  }

  if (!data) return null;

  return (
    <main className="max-w-6xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Analytics</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <SignalCard data={data.signal_distribution} />
        <SentimentCard data={data.sentiment_counts} />
      </div>

      <div className="mb-4">
        <VolumeChart data={data.volume_timeline} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <CategoryChart data={data.category_counts} />
        <SourceChart data={data.source_counts} />
      </div>
    </main>
  );
}
