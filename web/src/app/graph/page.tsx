import GraphCanvas from "@/components/GraphCanvas";

const mockNodes = [
  { id: "Rust", group: "Technology" },
  { id: "Go", group: "Technology" },
  { id: "AI", group: "Concept" },
  { id: "Machine Learning", group: "Concept" },
  { id: "Meta", group: "Organization" },
];

const mockLinks = [
  { source: "Rust", target: "AI", relation: "drives" },
  { source: "Go", target: "AI", relation: "related_to" },
  { source: "AI", target: "Machine Learning", relation: "includes" },
  { source: "Meta", target: "AI", relation: "researches" },
];

export default function GraphPage() {
  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Knowledge Graph</h1>
      <p className="text-gray-500 text-sm mb-4">
        Mock data — Phase 3.5 will wire up Neo4j via /graph/search endpoint.
      </p>
      <GraphCanvas nodes={mockNodes} links={mockLinks} />
    </main>
  );
}