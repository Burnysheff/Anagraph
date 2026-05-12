export interface GraphNode {
  id: string;
  name: string;
  type: string;
  connections: number;
  created_at?: string | null;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  context?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface Document {
  id: string;
  filename: string;
  text_length: number;
  num_chunks: number;
  status: "pending" | "processing" | "completed" | "error";
  created_at: string;
  triplets_extracted: number;
  error_message?: string | null;
}

export interface ExtractionProgress {
  chunk: number;
  total: number;
  triplets_so_far: number;
}

export interface QARequest {
  question: string;
  language?: string;
}

export interface QAResponse {
  answer: string;
  cypher_query: string;
  raw_results: Record<string, unknown>[];
  method: string;
}

export interface GraphStats {
  total_nodes: number;
  total_edges: number;
  types_distribution: { type: string; count: number }[];
  top_connected: { name: string; type: string; connections: number }[];
  documents_processed: number;
}

export const ENTITY_COLORS: Record<string, string> = {
  Person: "#89b4fa",
  Organization: "#a6e3a1",
  Technology: "#fab387",
  Concept: "#cba6f7",
  Location: "#f38ba8",
  Date: "#9399b2",
  Event: "#94e2d5",
  Product: "#f5c2e7",
};

export const ENTITY_TYPE_LABELS: Record<string, string> = {
  Person: "Персона",
  Organization: "Организация",
  Technology: "Технология",
  Concept: "Концепция",
  Location: "Место",
  Date: "Дата",
  Event: "Событие",
  Product: "Продукт",
};
