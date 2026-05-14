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
  language?: string | null;
  used_type_names?: string[] | null;
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

export interface EntityType {
  name: string;
  label: string;
  color: string;
  description: string;
  visible: boolean;
  is_default: boolean;
  position: number;
}

export interface EntityTypeCreate {
  name: string;
  label?: string;
  description?: string;
  color?: string;
}

export interface EntityTypeUpdate {
  label?: string;
  description?: string;
  color?: string;
  visible?: boolean;
  position?: number;
}

export const ORPHAN_TYPE_COLOR = "#585b70";
export const OTHER_TYPE_NAME = "Other";
