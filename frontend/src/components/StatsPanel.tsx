import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getGraphStats, clearGraph } from "../api/client";
import { ENTITY_COLORS, ENTITY_TYPE_LABELS } from "../types";

interface Props {
  refreshKey: number;
  onClear: () => void;
}

export default function StatsPanel({ refreshKey, onClear }: Props) {
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
