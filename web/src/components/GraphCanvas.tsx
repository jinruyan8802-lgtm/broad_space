"use client";
import { useEffect, useRef } from "react";
import * as d3 from "d3";

interface GraphNode {
  id: string;
  group: string;
}

interface GraphLink {
  source: string;
  target: string;
  relation: string;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
}

export default function GraphCanvas({ nodes, links }: GraphCanvasProps) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!ref.current || nodes.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = 800;
    const height = 600;
    svg.attr("width", width).attr("height", height);

    const colorMap: Record<string, string> = {
      Technology: "#ef4444",
      Concept: "#3b82f6",
      Organization: "#22c55e",
      Person: "#a855f7",
      Event: "#f59e0b",
    };

    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(links as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
          .id((d: any) => d.id)
          .distance(100)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.6);

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 8)
      .attr("fill", (d: any) => colorMap[d.group] || "#6b7280")
      .call(
        d3
          .drag<any, any>()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    node.append("title").text((d: any) => d.id);

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links]);

  return <svg ref={ref} className="border rounded" />;
}