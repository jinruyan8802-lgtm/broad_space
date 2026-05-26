"use client";
import { useState, useEffect } from "react";
import GraphCanvas, { GraphNode, GraphLink } from "@/components/GraphCanvas";
import { fetchGraph, GraphSearchResult } from "@/lib/api";

function buildGraphFromResults(results: GraphSearchResult[]): { nodes: GraphNode[]; links: GraphLink[] } {
  const nodesMap: Record<string, GraphNode> = {};
  const links: GraphLink[] = [];

  results.forEach((r, idx) => {
    const centerId = `result_${idx}`;
    nodesMap[centerId] = {
      id: r.text.substring(0, 50),
      group: "Concept",
      signal: r.score,
      summary: r.text,
    };

    const words = r.text.split(/[\s,.()]+/).filter(
      (w) => w.length > 3 && /^[A-Z][a-z]/.test(w) && !["The", "This", "That", "From", "With"].includes(w)
    );

    words.slice(0, 5).forEach((word) => {
      if (!nodesMap[word]) {
        nodesMap[word] = { id: word, group: "Technology", signal: 0.5 };
      }
      links.push({ source: centerId, target: word, value: 1 });
    });
  });

  return {
    nodes: Object.values(nodesMap),
    links: links.slice(0, Math.min(links.length, Object.keys(nodesMap).length * 3)),
  };
}

export default function GraphPage() {
  const [query, setQuery] = useState("AI");
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const [links, setLinks] = useState<GraphLink[]>([]);
  const [status, setStatus] = useState("Loading...");
  const [inputValue, setInputValue] = useState("AI");

  useEffect(() => {
    setStatus("Loading...");
    fetchGraph({ query, limit: 50 })
      .then((data) => {
        if (!data.results || data.results.length === 0) {
          setStatus("No results. Process some articles first.");
          setNodes([]);
          setLinks([]);
          return;
        }
        const { nodes: n, links: l } = buildGraphFromResults(data.results);
        setNodes(n);
        setLinks(l);
        setStatus(`${n.length} nodes, ${l.length} connections`);
      })
      .catch((e) => setStatus(`Error: ${e.message}`));
  }, [query]);

  return (
    <main className="p-6">
      <h1 className="text-2xl font-bold mb-4">Knowledge Graph</h1>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") setQuery(inputValue);
          }}
          placeholder="Search graph..."
          className="border rounded px-3 py-2 text-sm flex-1 max-w-xs"
        />
        <button
          onClick={() => setQuery(inputValue)}
          className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600"
        >
          Search
        </button>
      </div>
      <p className="text-gray-500 text-xs mb-4">{status}</p>
      <GraphCanvas nodes={nodes} links={links} />
    </main>
  );
}