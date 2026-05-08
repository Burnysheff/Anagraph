import { useQuery } from "@tanstack/react-query";
import { getNodeNeighbors } from "../api/client";
import { ENTITY_COLORS, ENTITY_TYPE_LABELS } from "../types";
import type { GraphNode } from "../types";

interface Props {
  node: GraphNode;
  onClose: () => void;
}

export default function NodeDetails({ node, onClose }: Props) {
  const { data } = useQuery({
    queryKey: ["neighbors", node.name],
    queryFn: () => getNodeNeighbors(node.name),
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          className="type-dot"
          style={{ background: ENTITY_COLORS[node.type] || "#666" }}
        />
        <strong>{node.name}</strong>
        <span style={{ color: "#a6adc8", fontSize: "0.85rem" }}>
          ({ENTITY_TYPE_LABELS[node.type] ?? node.type}) — {node.connections} связей
        </span>
      </div>

      {data && data.edges.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            fontSize: "0.85rem",
            flexWrap: "wrap",
            flex: 1,
          }}
        >
          {data.edges.slice(0, 8).map((edge, i) => {
            const target = data.nodes.find(
              (n) => n.id === edge.target || n.id === edge.source
            );
            return (
              <span key={i} style={{ color: "#a6adc8" }}>
                → {edge.type} → {target?.name || "..."}
              </span>
            );
          })}
        </div>
      )}

      <button
        onClick={onClose}
        style={{
          background: "transparent",
          color: "#a6adc8",
          fontSize: "1.2rem",
          padding: "0.25rem 0.5rem",
        }}
      >
        ✕
      </button>
    </div>
  );
}
