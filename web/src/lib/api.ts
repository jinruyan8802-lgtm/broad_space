const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ContentItem {
  id: string;
  title: string;
  url: string;
  summary: string;
  categories: string[];
  key_points: string[];
  signal_strength: number;
  sentiment: string;
  sources: { name: string; url: string }[];
  processed_at: string | null;
}

export async function fetchContent(params?: {
  category?: string;
  min_signal?: number;
  limit?: number;
}): Promise<ContentItem[]> {
  const qs = new URLSearchParams();
  if (params?.category) qs.set("category", params.category);
  if (params?.min_signal !== undefined) qs.set("min_signal", String(params.min_signal));
  if (params?.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${API_BASE}/content?${qs}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}