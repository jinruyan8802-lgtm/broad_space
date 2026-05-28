"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import * as d3 from "d3";

export interface GraphNode {
  id: string;
  label: string;
  labelZh?: string;
  group: string;
  signal?: number;
  summary?: string;
  degree?: number;
}

export interface GraphLink {
  source: string;
  target: string;
  relation?: string;
  relationZh?: string;
  confidence?: string;
  value?: number;
}

interface GraphCanvasProps {
  nodes: GraphNode[];
  links: GraphLink[];
  onNodeSelect?: (node: GraphNode) => void;
  selectedNode?: GraphNode | null;
  theme?: "dark" | "light";
}

const GROUP_COLORS: Record<string, string> = {
  Technology: "#ef4444",
  Concept: "#3b82f6",
  Organization: "#22c55e",
  Person: "#a855f7",
  Event: "#f59e0b",
  Entity: "#06b6d4",
  Paper: "#10b981",
  Trend: "#f97316",
  Platform: "#ec4899",
  Unknown: "#6b7280",
  Other: "#6b7280",
};

export default function GraphCanvas({
  nodes,
  links,
  onNodeSelect,
  selectedNode,
  theme = "dark",
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const zoomRef = useRef<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    x: number;
    y: number;
    content: { title: string; titleZh: string; group: string; degree: number };
  }>({ visible: false, x: 0, y: 0, content: { title: "", titleZh: "", group: "", degree: 0 } });

  const isDark = theme === "dark";
  const nodeTextColor = isDark ? "#e5e7eb" : "#1f2937";
  const edgeLabelColor = isDark ? "rgba(156,163,175,0.7)" : "rgba(107,114,128,0.7)";
  const dimOpacity = 0.12;

  // Compute degree for each node
  const degreeMap = useRef<Record<string, number>>({});
  useEffect(() => {
    const map: Record<string, number> = {};
    nodes.forEach((n) => (map[n.id] = 0));
    links.forEach((l) => {
      const sid = typeof l.source === "object" ? (l.source as any).id : l.source;
      const tid = typeof l.target === "object" ? (l.target as any).id : l.target;
      if (map[sid] !== undefined) map[sid]++;
      if (map[tid] !== undefined) map[tid]++;
    });
    degreeMap.current = map;
  }, [nodes, links]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 1.4);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(300).call(zoomRef.current.scaleBy, 0.7);
    }
  }, []);

  const handleReset = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
      d3.select(svgRef.current).transition().duration(500).call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }, []);

  useEffect(() => {
    if (!svgRef.current || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = svgRef.current.clientWidth || 900;
    const height = 600;
    svg.attr("width", width).attr("height", height);

    // Zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 5])
      .on("zoom", (event) => {
        container.attr("transform", event.transform);
      });
    zoomRef.current = zoom;
    svg.call(zoom);

    // Click background to deselect
    svg.on("click", (event) => {
      if (event.target === svgRef.current) {
        onNodeSelect?.(null as any);
      }
    });

    const container = svg.append("g");

    // Arrow markers
    const defs = svg.append("defs");
    ["EXTRACTED", "INFERRED", ""].forEach((conf) => {
      const color = conf === "INFERRED" ? "#9ca3af" : "#6b7280";
      defs
        .append("marker")
        .attr("id", `arrow-${conf || "default"}`)
        .attr("viewBox", "0 -5 10 10")
        .attr("refX", 20)
        .attr("refY", 0)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M0,-4L10,0L0,4")
        .attr("fill", color);
    });

    // Compute degree
    const dm = degreeMap.current;
    const maxDegree = Math.max(1, ...Object.values(dm));

    // Node radius scale: 8px to 24px
    const radiusScale = d3.scaleLinear().domain([0, maxDegree]).range([8, 24]).clamp(true);

    // Simulation
    const simulation = d3
      .forceSimulation(nodes as d3.SimulationNodeDatum[])
      .force(
        "link",
        d3
          .forceLink(links as d3.SimulationLinkDatum<d3.SimulationNodeDatum>[])
          .id((d: any) => d.id)
          .distance(120)
      )
      .force("charge", d3.forceManyBody().strength(-300))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => radiusScale(dm[d.id] || 0) + 8));

    // Draw edges
    const linkGroup = container.append("g").attr("class", "links");
    const link = linkGroup
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", isDark ? "#555" : "#ccc")
      .attr("stroke-opacity", 0.6)
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", (d: any) => (d.confidence === "INFERRED" ? "4,3" : "none"))
      .attr("marker-end", (d: any) => `url(#arrow-${d.confidence || "default"})`);

    // Edge labels
    const edgeLabelGroup = container.append("g").attr("class", "edge-labels");
    const edgeLabel = edgeLabelGroup
      .selectAll("text")
      .data(links)
      .join("text")
      .text((d: any) => {
        const label = d.relationZh || d.relation || "";
        return label.length > 12 ? label.substring(0, 12) + "..." : label;
      })
      .attr("font-size", "9px")
      .attr("fill", edgeLabelColor)
      .attr("text-anchor", "middle")
      .attr("pointer-events", "none");

    // Draw nodes
    const nodeGroup = container.append("g").attr("class", "nodes");
    const node = nodeGroup
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", (d: any) => radiusScale(dm[d.id] || 0))
      .attr("fill", (d: any) => GROUP_COLORS[d.group] || GROUP_COLORS.Other)
      .attr("stroke", (d: any) =>
        selectedNode?.id === d.id ? "#fff" : isDark ? "#1a1a2e" : "#fff"
      )
      .attr("stroke-width", (d: any) => (selectedNode?.id === d.id ? 3 : 1.5))
      .style("cursor", "pointer")
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

    // Node labels
    const nodeLabelGroup = container.append("g").attr("class", "node-labels");
    const nodeLabel = nodeLabelGroup
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d: any) => {
        const label = d.labelZh || d.label;
        return label.length > 14 ? label.substring(0, 14) + "..." : label;
      })
      .attr("font-size", "11px")
      .attr("font-weight", "500")
      .attr("fill", nodeTextColor)
      .attr("text-anchor", "middle")
      .attr("dy", (d: any) => radiusScale(dm[d.id] || 0) + 14)
      .attr("pointer-events", "none")
      .attr("stroke", isDark ? "#0f0f1a" : "#fff")
      .attr("stroke-width", 2.5)
      .attr("paint-order", "stroke");

    // Neighbor lookup for focus mode
    const neighborMap = new Map<string, Set<string>>();
    nodes.forEach((n) => neighborMap.set(n.id, new Set()));
    links.forEach((l) => {
      const sid = typeof l.source === "object" ? (l.source as any).id : l.source;
      const tid = typeof l.target === "object" ? (l.target as any).id : l.target;
      neighborMap.get(sid)?.add(tid);
      neighborMap.get(tid)?.add(sid);
    });

    function applyFocus(focusedId: string | null) {
      if (!focusedId) {
        // Overview mode
        node.attr("opacity", 1);
        link.attr("opacity", 0.6);
        edgeLabel.attr("opacity", 1);
        nodeLabel.attr("opacity", 1);
        return;
      }
      const neighbors = neighborMap.get(focusedId) || new Set();
      neighbors.add(focusedId);

      node.attr("opacity", (d: any) => (neighbors.has(d.id) ? 1 : dimOpacity));
      link.attr("opacity", (d: any) => {
        const sid = typeof d.source === "object" ? d.source.id : d.source;
        const tid = typeof d.target === "object" ? d.target.id : d.target;
        return neighbors.has(sid) && neighbors.has(tid) ? 0.8 : dimOpacity;
      });
      edgeLabel.attr("opacity", (d: any) => {
        const sid = typeof d.source === "object" ? d.source.id : d.source;
        const tid = typeof d.target === "object" ? d.target.id : d.target;
        return neighbors.has(sid) && neighbors.has(tid) ? 1 : dimOpacity;
      });
      nodeLabel.attr("opacity", (d: any) => (neighbors.has(d.id) ? 1 : dimOpacity));
    }

    // Apply initial focus
    applyFocus(selectedNode?.id || null);

    // Node interactions
    node
      .on("mouseover", function (event, d: any) {
        if (!selectedNode) {
          applyFocus(d.id);
        }
        setTooltip({
          visible: true,
          x: event.pageX + 12,
          y: event.pageY - 10,
          content: {
            title: d.label,
            titleZh: d.labelZh || "",
            group: d.group,
            degree: dm[d.id] || 0,
          },
        });
      })
      .on("mousemove", function (event) {
        setTooltip((prev) => ({ ...prev, x: event.pageX + 12, y: event.pageY - 10 }));
      })
      .on("mouseout", function () {
        if (!selectedNode) {
          applyFocus(null);
        }
        setTooltip((prev) => ({ ...prev, visible: false }));
      })
      .on("click", function (event, d: any) {
        event.stopPropagation();
        if (selectedNode?.id === d.id) {
          onNodeSelect?.(null as any);
        } else {
          onNodeSelect?.(d as GraphNode);
        }
      });

    // Tick
    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);

      edgeLabel
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2 - 4);

      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);

      nodeLabel.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });

    return () => {
      simulation.stop();
    };
  }, [nodes, links, selectedNode, isDark, onNodeSelect]);

  // Re-apply focus when selectedNode changes
  useEffect(() => {
    if (!svgRef.current) return;
    const svg = d3.select(svgRef.current);
    const focusedId = selectedNode?.id || null;
    const dm = degreeMap.current;

    const neighborMap = new Map<string, Set<string>>();
    nodes.forEach((n) => neighborMap.set(n.id, new Set()));
    links.forEach((l) => {
      const sid = typeof l.source === "object" ? (l.source as any).id : l.source;
      const tid = typeof l.target === "object" ? (l.target as any).id : l.target;
      neighborMap.get(sid)?.add(tid);
      neighborMap.get(tid)?.add(sid);
    });

    if (!focusedId) {
      svg.selectAll(".nodes circle").attr("opacity", 1);
      svg.selectAll(".links line").attr("opacity", 0.6);
      svg.selectAll(".edge-labels text").attr("opacity", 1);
      svg.selectAll(".node-labels text").attr("opacity", 1);
    } else {
      const neighbors = neighborMap.get(focusedId) || new Set();
      neighbors.add(focusedId);
      svg.selectAll(".nodes circle").attr("opacity", (d: any) => (neighbors.has(d.id) ? 1 : dimOpacity));
      svg.selectAll(".links line").attr("opacity", (d: any) => {
        const sid = typeof d.source === "object" ? d.source.id : d.source;
        const tid = typeof d.target === "object" ? d.target.id : d.target;
        return neighbors.has(sid) && neighbors.has(tid) ? 0.8 : dimOpacity;
      });
      svg.selectAll(".edge-labels text").attr("opacity", (d: any) => {
        const sid = typeof d.source === "object" ? d.source.id : d.source;
        const tid = typeof d.target === "object" ? d.target.id : d.target;
        return neighbors.has(sid) && neighbors.has(tid) ? 1 : dimOpacity;
      });
      svg.selectAll(".node-labels text").attr("opacity", (d: any) => (neighbors.has(d.id) ? 1 : dimOpacity));
    }
  }, [selectedNode, nodes, links]);

  return (
    <div className="relative w-full h-full" style={{ background: isDark ? "#0f0f1a" : "#f9fafb" }}>
      <svg ref={svgRef} className="w-full" style={{ height: "600px" }} />

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1">
        <button
          onClick={handleZoomIn}
          className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${
            isDark ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-white text-gray-700 hover:bg-gray-100"
          } border ${isDark ? "border-gray-600" : "border-gray-300"} shadow`}
        >
          +
        </button>
        <button
          onClick={handleZoomOut}
          className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold ${
            isDark ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-white text-gray-700 hover:bg-gray-100"
          } border ${isDark ? "border-gray-600" : "border-gray-300"} shadow`}
        >
          -
        </button>
        <button
          onClick={handleReset}
          className={`w-8 h-8 rounded flex items-center justify-center text-xs ${
            isDark ? "bg-gray-700 text-gray-200 hover:bg-gray-600" : "bg-white text-gray-700 hover:bg-gray-100"
          } border ${isDark ? "border-gray-600" : "border-gray-300"} shadow`}
        >
          ⟳
        </button>
      </div>

      {/* Legend */}
      <div
        className={`absolute top-3 left-3 text-xs px-3 py-2 rounded-lg ${
          isDark ? "bg-gray-800/80 text-gray-300" : "bg-white/80 text-gray-600"
        } border ${isDark ? "border-gray-700" : "border-gray-200"}`}
      >
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(GROUP_COLORS).map(([name, color]) => (
            <span key={name} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full inline-block" style={{ background: color }} />
              {name}
            </span>
          ))}
          <span className="flex items-center gap-1 ml-2">
            <span className="w-4 border-t border-gray-400 inline-block" /> 实线=确定
          </span>
          <span className="flex items-center gap-1">
            <span className="w-4 border-t border-dashed border-gray-400 inline-block" /> 虚线=推测
          </span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip.visible && (
        <div
          className="absolute pointer-events-none z-50 bg-gray-900 text-white text-xs rounded-lg px-3 py-2 shadow-lg max-w-xs"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          <div className="font-semibold">{tooltip.content.title}</div>
          {tooltip.content.titleZh && tooltip.content.titleZh !== tooltip.content.title && (
            <div className="text-gray-400">{tooltip.content.titleZh}</div>
          )}
          <div className="text-gray-400 mt-0.5">
            {tooltip.content.group} · {tooltip.content.degree} 个连接
          </div>
        </div>
      )}
    </div>
  );
}
