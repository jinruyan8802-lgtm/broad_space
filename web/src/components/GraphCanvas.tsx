"use client";
import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export interface GraphNode {
  id: string;
  group: string;
  signal?: number;
  summary?: string;
}

export interface GraphLink {
  source: string;
  target: string;
  relation?: string;
  value?: number;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
}

interface TooltipState {
  visible: boolean;
  x: number;
  y: number;
  content: { title: string; group: string; signal: number; summary: string };
}

export default function GraphCanvas({ nodes, links }: GraphCanvasProps) {
  const ref = useRef<SVGSVGElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false,
    x: 0,
    y: 0,
    content: { title: "", group: "", signal: 0, summary: "" },
  });

  useEffect(() => {
    if (!ref.current || nodes.length === 0) return;

    const svg = d3.select(ref.current);
    svg.selectAll("*").remove();

    const width = window.innerWidth;
    const height = window.innerHeight;
    svg.attr("width", width).attr("height", height);

    const colorMap: Record<string, string> = {
      Technology: "#ef4444",
      Concept: "#3b82f6",
      Organization: "#22c55e",
      Person: "#a855f7",
      Event: "#f59e0b",
      Other: "#6b7280",
    };

    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(links as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
          .id((d: any) => d.id)
          .distance(80)
      )
      .force("charge", d3.forceManyBody().strength(-200))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide(20));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", "#999")
      .attr("stroke-opacity", 0.3)
      .attr("stroke-width", (d: any) => Math.sqrt(d.value || 1));

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => 5 + (d.signal || 0) * 8)
      .attr("fill", (d: any) => colorMap[d.group] || colorMap.Other)
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

    node
      .on("mouseover", function (event, d: any) {
        setTooltip({
          visible: true,
          x: event.pageX + 12,
          y: event.pageY - 10,
          content: {
            title: d.id,
            group: d.group,
            signal: d.signal || 0,
            summary: d.summary || "",
          },
        });
      })
      .on("mousemove", function (event) {
        setTooltip((prev) => ({
          ...prev,
          x: event.pageX + 12,
          y: event.pageY - 10,
        }));
      })
      .on("mouseout", function () {
        setTooltip((prev) => ({ ...prev, visible: false }));
      });

    node
      .append("text")
      .text((d: any) => d.id.substring(0, 20))
      .attr("x", 10)
      .attr("y", 3)
      .attr("font-size", "10px")
      .attr("pointer-events", "none");

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

  return (
    <div className="relative">
      <svg ref={ref} className="w-full h-screen" />
      {tooltip.visible && (
        <div
          className="absolute bg-white border border-gray-200 rounded-lg p-3 text-sm shadow-lg max-w-xs pointer-events-none z-50"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-semibold text-gray-900">{tooltip.content.title}</div>
          <div className="text-gray-500 text-xs mt-1">
            {tooltip.content.group} | signal: {tooltip.content.signal.toFixed(2)}
          </div>
          {tooltip.content.summary && (
            <div className="text-gray-700 text-xs mt-1 line-clamp-3">
              {tooltip.content.summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}