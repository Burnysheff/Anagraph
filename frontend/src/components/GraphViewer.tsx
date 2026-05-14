import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Network } from "vis-network";
import { DataSet } from "vis-data";
import { getGraph } from "../api/client";
import { useEntityTypes } from "../hooks/useEntityTypes";
import { ORPHAN_TYPE_COLOR } from "../types";
import type { GraphNode, GraphEdge } from "../types";

interface Props {
  refreshKey: number;
  onNodeSelect: (node: GraphNode) => void;
}

interface NodeItem {
  id: string;
  label: string;
  color: { background: string; border: string; highlight: { background: string; border: string } };
  font: { color: string; size: number };
  size: number;
  title: string;
  borderWidth: number;
  _raw: GraphNode;
  _origColor: NodeItem["color"];
  _origFontColor: string;
  _origBorderWidth: number;
}

interface EdgeItem {
  id: string;
  from: string;
  to: string;
  label: string;
  font: { color: string; size: number; strokeWidth: number };
  color: { color: string; highlight: string };
  arrows: string;
  _raw: GraphEdge;
  _origColor: EdgeItem["color"];
  _origFontColor: string;
}

const DIM_BG = "#313244";
const DIM_BORDER = "#45475a";
const DIM_FONT = "#6c7086";
const DIM_EDGE = "#313244";
const FRESH_BORDER = "#fab387";
const FRESH_WINDOW_MS = 30_000;

export default function GraphViewer({ refreshKey, onNodeSelect }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const nodesRef = useRef<DataSet<NodeItem> | null>(null);
  const edgesRef = useRef<DataSet<EdgeItem> | null>(null);
  const [edgeTooltip, setEdgeTooltip] = useState<{ x: number; y: number; edge: GraphEdge } | null>(null);

  const { typesByName, getColor } = useEntityTypes();

  const { data } = useQuery({
    queryKey: ["graph", refreshKey],
    queryFn: () => getGraph(500),
  });

  const visibleData = useMemo(() => {
    if (!data) return null;
    const isVisible = (typeName: string) => {
      const t = typesByName.get(typeName);
      return t ? t.visible : true;
    };
    const nodes = data.nodes.filter((n) => isVisible(n.type));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = data.edges.filter(
      (e) => nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    return { nodes, edges };
  }, [data, typesByName]);

  const resetHighlight = () => {
    if (!nodesRef.current || !edgesRef.current) return;
    const restoredNodes = nodesRef.current.get().map((n) => ({
      id: n.id,
      color: n._origColor,
      font: { color: n._origFontColor, size: 16 },
    }));
    const restoredEdges = edgesRef.current.get().map((e) => ({
      id: e.id,
      color: e._origColor,
      font: { color: e._origFontColor, size: 12, strokeWidth: 0 },
    }));
    nodesRef.current.update(restoredNodes);
    edgesRef.current.update(restoredEdges);
  };

  const highlightConnected = (centerNodeIds: string[], extraEdgeIds: string[] = []) => {
    if (!nodesRef.current || !edgesRef.current || !networkRef.current) return;
    const network = networkRef.current;
    const connectedNodeIds = new Set<string>(centerNodeIds);
    const connectedEdgeIds = new Set<string>(extraEdgeIds);
    for (const id of centerNodeIds) {
      const neighbors = network.getConnectedNodes(id) as string[];
      neighbors.forEach((n) => connectedNodeIds.add(n));
      const edges = network.getConnectedEdges(id) as string[];
      edges.forEach((e) => connectedEdgeIds.add(e));
    }

    const nodeUpdates = nodesRef.current.get().map((n) => {
      if (connectedNodeIds.has(n.id)) {
        return { id: n.id, color: n._origColor, font: { color: n._origFontColor, size: 16 } };
      }
      return {
        id: n.id,
        color: { background: DIM_BG, border: DIM_BORDER, highlight: { background: DIM_BG, border: DIM_BORDER } },
        font: { color: DIM_FONT, size: 16 },
      };
    });
    const edgeUpdates = edgesRef.current.get().map((e) => {
      if (connectedEdgeIds.has(e.id)) {
        return { id: e.id, color: e._origColor, font: { color: e._origFontColor, size: 12, strokeWidth: 0 } };
      }
      return {
        id: e.id,
        color: { color: DIM_EDGE, highlight: DIM_EDGE },
        font: { color: DIM_FONT, size: 12, strokeWidth: 0 },
      };
    });
    nodesRef.current.update(nodeUpdates);
    edgesRef.current.update(edgeUpdates);
  };

  useEffect(() => {
    if (!containerRef.current || !visibleData) return;

    const now = Date.now();
    const freshIds: string[] = [];
    const nodeItems: NodeItem[] = visibleData.nodes.map((n) => {
      const bg = getColor(n.type) || ORPHAN_TYPE_COLOR;
      const baseColor = {
        background: bg,
        border: bg,
        highlight: { background: bg, border: "#cdd6f4" },
      };
      const isFresh = n.created_at
        ? now - new Date(n.created_at).getTime() < FRESH_WINDOW_MS
        : false;
      if (isFresh) freshIds.push(n.id);
      const color = isFresh
        ? { ...baseColor, border: FRESH_BORDER, highlight: { background: bg, border: FRESH_BORDER } }
        : baseColor;
      return {
        id: n.id,
        label: n.name,
        color,
        font: { color: "#cdd6f4", size: 16 },
        size: Math.min(10 + n.connections * 2, 40),
        title: `${n.name} (${n.type})`,
        borderWidth: isFresh ? 4 : 2,
        _raw: n,
        _origColor: baseColor,
        _origFontColor: "#cdd6f4",
        _origBorderWidth: 2,
      };
    });

    const edgeItems: EdgeItem[] = visibleData.edges.map((e) => {
      const color = { color: "#45475a", highlight: "#89b4fa" };
      return {
        id: e.id,
        from: e.source,
        to: e.target,
        label: e.type,
        font: { color: "#a6adc8", size: 12, strokeWidth: 0 },
        color,
        arrows: "to",
        _raw: e,
        _origColor: color,
        _origFontColor: "#a6adc8",
      };
    });

    const nodes = new DataSet<NodeItem>(nodeItems);
    const edges = new DataSet<EdgeItem>(edgeItems);
    nodesRef.current = nodes;
    edgesRef.current = edges;

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
        if (nodeData) {
          onNodeSelect(nodeData._raw);
          highlightConnected([nodeId]);
          setEdgeTooltip(null);
        }
      } else if (params.edges.length > 0) {
        const edgeId = params.edges[0] as string;
        const edgeData = edges.get(edgeId);
        if (edgeData) {
          setEdgeTooltip({
            x: params.pointer.DOM.x,
            y: params.pointer.DOM.y,
            edge: edgeData._raw,
          });
          highlightConnected([edgeData.from, edgeData.to], [edgeId]);
        }
      } else {
        resetHighlight();
        setEdgeTooltip(null);
      }
    });

    network.on("doubleClick", (params) => {
      if (params.nodes.length > 0) {
        const nodeId = params.nodes[0] as string;
        network.focus(nodeId, {
          scale: 1.5,
          animation: { duration: 600, easingFunction: "easeInOutQuad" },
        });
      }
    });

    networkRef.current = network;

    let freshTimer: number | undefined;
    if (freshIds.length > 0) {
      freshTimer = window.setTimeout(() => {
        if (!nodesRef.current) return;
        const restored = freshIds.map((id) => {
          const item = nodesRef.current!.get(id);
          if (!item) return null;
          return {
            id,
            color: item._origColor,
            borderWidth: item._origBorderWidth,
          };
        }).filter((x): x is { id: string; color: NodeItem["color"]; borderWidth: number } => x !== null);
        nodesRef.current.update(restored);
      }, FRESH_WINDOW_MS);
    }

    return () => {
      if (freshTimer !== undefined) clearTimeout(freshTimer);
      network.destroy();
      networkRef.current = null;
      nodesRef.current = null;
      edgesRef.current = null;
    };
  }, [visibleData, onNodeSelect, getColor]);

  useEffect(() => {
    setEdgeTooltip(null);
  }, [visibleData]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setEdgeTooltip(null);
        resetHighlight();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      style={{
        position: "relative",
        flex: 1,
        minHeight: 0,
        overflow: "hidden",
      }}
    >
      <div
        ref={containerRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "#1e1e2e",
        }}
      />
      {edgeTooltip && (
        <div
          style={{
            position: "absolute",
            left: Math.min(edgeTooltip.x + 12, (containerRef.current?.clientWidth ?? 800) - 340),
            top: edgeTooltip.y + 12,
            maxWidth: 320,
            background: "#252536",
            border: "1px solid #45475a",
            borderRadius: 8,
            padding: "0.6rem 0.75rem",
            boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
            fontSize: "0.85rem",
            zIndex: 100,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
            <strong style={{ color: "#89b4fa" }}>{edgeTooltip.edge.type}</strong>
            <button
              onClick={() => setEdgeTooltip(null)}
              style={{
                background: "transparent",
                color: "#a6adc8",
                fontSize: "1rem",
                padding: "0 0.25rem",
              }}
            >
              ✕
            </button>
          </div>
          {edgeTooltip.edge.context ? (
            <div style={{ color: "#a6adc8", lineHeight: 1.4 }}>
              {edgeTooltip.edge.context}
            </div>
          ) : (
            <div style={{ color: "#6c7086", fontStyle: "italic" }}>Контекст не сохранён</div>
          )}
        </div>
      )}
    </div>
  );
}
