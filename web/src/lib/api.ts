const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface ScoreBreakdown {
  exploit: number;
  expand: number;
  explore: number;
}

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
  final_score: number;
  score_breakdown: ScoreBreakdown;
}

export interface GraphSearchResult {
  text: string;
  score: number;
  entities: string[];
  entity_names_zh: string[];
  subject: string;
  subject_zh: string;
  subject_type: string;
  predicate: string;
  predicate_zh: string;
  object: string;
  object_zh: string;
  object_type: string;
  confidence: string;
}

export interface GraphSearchResponse {
  query: string;
  results: GraphSearchResult[];
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

export async function fetchGraph(params: {
  query: string;
  limit?: number;
}): Promise<GraphSearchResponse> {
  const qs = new URLSearchParams({ query: params.query });
  if (params.limit) qs.set("limit", String(params.limit));
  const res = await fetch(`${API_BASE}/graph/search?${qs}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface SignalDistribution {
  high: number;
  mid: number;
  low: number;
}

export interface CategoryCount {
  category: string;
  count: number;
}

export interface SentimentCounts {
  positive: number;
  neutral: number;
  negative: number;
}

export interface VolumeDataPoint {
  date: string;
  count: number;
}

export interface SourceCount {
  source: string;
  count: number;
}

export interface TrendingTopic {
  topic: string;
  current_count: number;
  previous_count: number;
  change_ratio: number;
  status: "rising" | "falling" | "stable";
}

export interface ScoreBreakdownStats {
  avg_exploit: number;
  avg_expand: number;
  avg_explore: number;
  avg_final: number;
}

export interface CategorySourceDiversity {
  category: string;
  covered_sources: string[];
  missing_sources: string[];
  coverage_ratio: number;
}

export interface AnalyticsResponse {
  signal_distribution: SignalDistribution;
  category_counts: CategoryCount[];
  sentiment_counts: SentimentCounts;
  volume_timeline: VolumeDataPoint[];
  source_counts: SourceCount[];
  trending_topics: TrendingTopic[];
  score_distribution: ScoreBreakdownStats;
  source_diversity_by_category: CategorySourceDiversity[];
}

export async function fetchAnalytics(days: number = 7): Promise<AnalyticsResponse> {
  const res = await fetch(`${API_BASE}/analytics?days=${days}`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export interface SourceHealthItem {
  source: string;
  last_seen: string | null;
  status: "online" | "stale" | "offline";
}

export interface KnowledgeGraphStats {
  nodes: number;
  edges: number;
  today_new_nodes: number;
  today_new_edges: number;
}

export interface RecentActivity {
  title: string;
  source: string;
  processed_at: string;
  signal_strength: number;
}

export interface DashboardStatsResponse {
  today_articles: number;
  total_articles: number;
  graph: KnowledgeGraphStats;
  source_health: SourceHealthItem[];
  recent_activity: RecentActivity[];
}

export async function fetchDashboardStats(): Promise<DashboardStatsResponse> {
  const res = await fetch(`${API_BASE}/dashboard/stats`);
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}