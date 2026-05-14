import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { searchNodes } from "../api/client";
import { useEntityTypes } from "../hooks/useEntityTypes";
import type { GraphNode } from "../types";

interface Props {
  onSelect: (node: GraphNode) => void;
}

export default function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const { getColor, getLabel } = useEntityTypes();

  const { data: results } = useQuery({
    queryKey: ["search", query],
    queryFn: () => searchNodes(query),
    enabled: query.length >= 2,
  });

  return (
    <div className="panel">
      <h3>Поиск</h3>
      <input
        type="text"
        placeholder="Поиск узлов..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {results && results.length > 0 && query.length >= 2 && (
        <div style={{ marginTop: "0.5rem", maxHeight: 200, overflowY: "auto" }}>
          {results.map((node) => (
            <div
              key={node.id}
              onClick={() => {
                onSelect(node);
                setQuery("");
              }}
              style={{
                padding: "0.4rem 0.5rem",
                cursor: "pointer",
                borderRadius: 4,
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                fontSize: "0.85rem",
              }}
              onMouseOver={(e) =>
                (e.currentTarget.style.background = "#45475a")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.background = "transparent")
              }
            >
              <span
                className="type-dot"
                style={{ background: getColor(node.type) }}
              />
              {node.name}
              <span style={{ color: "#a6adc8", marginLeft: "auto" }}>
                {getLabel(node.type)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
