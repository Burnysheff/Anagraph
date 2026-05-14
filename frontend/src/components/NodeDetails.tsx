import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { deleteNode, getNodeNeighbors } from "../api/client";
import { useToast } from "./Toast";
import { useEntityTypes } from "../hooks/useEntityTypes";
import type { GraphNode } from "../types";

interface Props {
  node: GraphNode;
  onClose: () => void;
  onDeleted: () => void;
}

export default function NodeDetails({ node, onClose, onDeleted }: Props) {
  const { data } = useQuery({
    queryKey: ["neighbors", node.name],
    queryFn: () => getNodeNeighbors(node.name),
  });
  const toast = useToast();
  const { getColor, getLabel, isKnown } = useEntityTypes();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!confirming) return;
    const onClickOutside = (e: MouseEvent) => {
      if (deleteWrapRef.current && !deleteWrapRef.current.contains(e.target as Node)) {
        setConfirming(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConfirming(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [confirming]);

  const performDelete = async () => {
    setDeleting(true);
    try {
      await deleteNode(node.name);
      toast.push(`Удалён узел «${node.name}»`, "success");
      onDeleted();
    } catch (err) {
      toast.push(
        err instanceof Error ? err.message : "Не удалось удалить узел",
        "error"
      );
    } finally {
      setDeleting(false);
      setConfirming(false);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span
          className="type-dot"
          style={{ background: getColor(node.type) }}
        />
        <strong>{node.name}</strong>
        <span style={{ color: "#a6adc8", fontSize: "0.85rem" }}>
          ({getLabel(node.type)}
          {!isKnown(node.type) && (
            <span style={{ color: "#f9e2af" }} title="Тип удалён из реестра">
              {" "}· удалён
            </span>
          )}
          ) — {node.connections} связей
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

      <div ref={deleteWrapRef} style={{ position: "relative" }}>
        <button
          onClick={() => setConfirming(true)}
          disabled={deleting || confirming}
          style={{
            background: "transparent",
            color: "#f38ba8",
            border: "1px solid #f38ba8",
            fontSize: "0.8rem",
            padding: "0.35rem 0.7rem",
          }}
        >
          {deleting ? "Удаление..." : "Удалить"}
        </button>
        {confirming && (
          <div
            style={{
              position: "absolute",
              bottom: "calc(100% + 8px)",
              right: 0,
              width: 260,
              background: "#252536",
              border: "1px solid #f38ba8",
              borderRadius: 8,
              padding: "0.75rem",
              boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
              zIndex: 1000,
            }}
          >
            <div
              style={{
                color: "#f38ba8",
                fontSize: "0.85rem",
                lineHeight: 1.4,
                marginBottom: "0.6rem",
              }}
            >
              Удалить? Также будут удалены все рёбра вершины ({node.connections}).
            </div>
            <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                style={{
                  background: "transparent",
                  color: "#a6adc8",
                  fontSize: "0.8rem",
                  padding: "0.3rem 0.6rem",
                }}
              >
                Отмена
              </button>
              <button
                onClick={performDelete}
                disabled={deleting}
                style={{
                  background: "#f38ba8",
                  color: "#1e1e2e",
                  fontSize: "0.8rem",
                  padding: "0.3rem 0.6rem",
                  fontWeight: 600,
                }}
              >
                {deleting ? "Удаление..." : "Точно удалить"}
              </button>
            </div>
          </div>
        )}
      </div>
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
