import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Network } from "vis-network";
import { DataSet } from "vis-data";
import { getGraph } from "../api/client";
import { ENTITY_COLORS } from "../types";
import type { GraphNode } from "../types";

interface Props {
  refreshKey: number;
  activeTypes: string[];
  onNodeSelect: (node: GraphNode) => void;
}

export default function GraphViewer({
  refreshKey,
  activeTypes,
  onNodeSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);

  const { data } = useQuery({
    queryKey: ["graph", refreshKey, activeTypes],
    queryFn: () =>
      getGraph(500, activeTypes.length > 0 ? activeTypes : undefined),
  });

  useEffect(() => {
    if (!containerRef.current || !data) return;

    const nodes = new DataSet(
      data.nodes.map((n) => ({
        id: n.id,
        label: n.name,
        color: {
          background: ENTITY_COLORS[n.type] || "#585b70",
          border: ENTITY_COLORS[n.type] || "#585b70",
          highlight: {
            background: ENTITY_COLORS[n.type] || "#585b70",
            border: "#cdd6f4",
          },
        },
        font: { color: "#cdd6f4", size: 16 },
        size: Math.min(10 + n.connections * 2, 40),
        title: `${n.name} (${n.type})`,
        _raw: n,
      }))
    );

    const edges = new DataSet(
      data.edges.map((e) => ({
        id: e.id,
        from: e.source,
        to: e.target,
        label: e.type,
        font: { color: "#a6adc8", size: 12, strokeWidth: 0 },
        color: { color: "#45475a", highlight: "#89b4fa" },
        arrows: "to",
      }))
    );

    const network = new Network(
      containerRef.current,
      { nodes, edges },
      {
        physics: {
          solver: "barnesHut",
          barnesHut: {
            gravitationalConstant: -3000,
            springLength: 150,
            springConstant: 0.02,
          },
          stabilization: { iterations: 100 },
        },
        interaction: {
          hover: true,
          tooltipDelay: 200,
        },
        nodes: {
          shape: "dot",
          borderWidth: 2,
        },
        edges: {
          smooth: { enabled: true, type: "continuous", roundness: 0.5 },
        },
      }
    );

    network.on("click", (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0] as string;
        const nodeData = nodes.get(nodeId);
        if (nodeData && "_raw" in nodeData) {
          onNodeSelect(nodeData._raw as GraphNode);
        }
      }
    });

    networkRef.current = network;

    return () => {
      network.destroy();
    };
  }, [data, onNodeSelect]);

  return (
    <div
      ref={containerRef}
      style={{
        flex: 1,
        background: "#1e1e2e",
        minHeight: 400,
      }}
    />
  );
}
