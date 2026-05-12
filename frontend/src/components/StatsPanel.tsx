import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGraphStats, clearGraph } from "../api/client";
import { ENTITY_COLORS, ENTITY_TYPE_LABELS } from "../types";
import type { GraphNode } from "../types";

interface Props {
  refreshKey: number;
  onClear: () => void;
  onSelectNode: (node: GraphNode) => void;
}

export default function StatsPanel({ refreshKey, onClear, onSelectNode }: Props) {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const { data: stats } = useQuery({
    queryKey: ["stats", refreshKey],
    queryFn: getGraphStats,
  });

  const handleClear = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setClearing(true);
    try {
      await clearGraph();
      onClear();
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  };

  if (!stats) return null;

  return (
    <div className="panel">
      <h3>Статистика</h3>
      <div style={{ fontSize: "0.9rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
        <div>Узлов: <strong>{stats.total_nodes}</strong></div>
        <div>Связей: <strong>{stats.total_edges}</strong></div>
        <div>Документов: <strong>{stats.documents_processed}</strong></div>
      </div>

      {stats.types_distribution.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#a6adc8", marginBottom: "0.4rem" }}>
            По типам
          </div>
          {stats.types_distribution.map((t) => (
            <div
              key={t.type}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.85rem",
                padding: "0.15rem 0",
              }}
            >
              <span
                className="type-dot"
                style={{ background: ENTITY_COLORS[t.type as string] || "#666" }}
              />
              <span style={{ flex: 1 }}>
                {ENTITY_TYPE_LABELS[t.type as string] ?? t.type}
              </span>
              <span style={{ color: "#a6adc8" }}>{t.count}</span>
            </div>
          ))}
        </div>
      )}

      {stats.top_connected.length > 0 && (
        <div style={{ marginTop: "0.75rem" }}>
          <div style={{ fontSize: "0.8rem", color: "#a6adc8", marginBottom: "0.4rem" }}>
            Самые связанные
          </div>
          {stats.top_connected.slice(0, 10).map((node, i) => (
            <div
              key={`${node.name}-${i}`}
              onClick={() =>
                onSelectNode({
                  id: node.name,
                  name: node.name,
                  type: node.type,
                  connections: node.connections,
                })
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.85rem",
                padding: "0.2rem 0.25rem",
                cursor: "pointer",
                borderRadius: 4,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = "#313244")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span style={{ color: "#6c7086", width: 18, textAlign: "right" }}>{i + 1}</span>
              <span
                className="type-dot"
                style={{ background: ENTITY_COLORS[node.type] || "#666" }}
              />
              <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {node.name}
              </span>
              <span style={{ color: "#a6adc8" }}>{node.connections}</span>
            </div>
          ))}
        </div>
      )}

      {stats.total_nodes > 0 && (
        <button
          onClick={handleClear}
          disabled={clearing}
          onBlur={() => setConfirming(false)}
          style={{
            marginTop: "0.75rem",
            width: "100%",
            background: confirming ? "#f38ba8" : "transparent",
            color: confirming ? "#1e1e2e" : "#f38ba8",
            border: "1px solid #f38ba8",
            fontSize: "0.8rem",
            padding: "0.4rem",
            fontWeight: confirming ? 600 : 400,
          }}
        >
          {clearing ? "Очистка..." : confirming ? "Точно очистить?" : "Очистить граф"}
        </button>
      )}
    </div>
  );
}
