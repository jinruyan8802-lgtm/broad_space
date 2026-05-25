import FeedCard from "@/components/FeedCard";
import { fetchContent } from "@/lib/api";

export default async function Home({
  searchParams,
}: {
  searchParams: { category?: string; limit?: string };
}) {
  const items = await fetchContent({ limit: Number(searchParams.limit) || 20 });
  return (
    <main className="max-w-3xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">BroadSpace Feed</h1>
      {items.length === 0 ? (
        <p className="text-gray-500">No content yet. Run the pipeline to populate.</p>
      ) : (
        items.map((a) => <FeedCard key={a.id} {...a} />)
      )}
    </main>
  );
}