import axios from "axios";
import type {
  Document,
  GraphData,
  GraphStats,
  GraphNode,
  QARequest,
  QAResponse,
} from "../types";

const API_BASE = "/api";

export const api = axios.create({
  baseURL: API_BASE,
});

export async function uploadDocument(
  file: File,
  language: string = "auto",
  entityTypes?: string[]
): Promise<{ id: string; filename: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("language", language);
  if (entityTypes && entityTypes.length > 0) {
    formData.append("entity_types", JSON.stringify(entityTypes));
  }
  const { data } = await api.post("/documents", formData);
  return data;
}

export async function uploadText(
  text: string,
  language: string = "auto",
  entityTypes?: string[]
): Promise<{ id: string; filename: string; status: string }> {
  const body: Record<string, unknown> = { text, language };
  if (entityTypes && entityTypes.length > 0) {
    body.entity_types = entityTypes;
  }
  const { data } = await api.post("/documents/text", body);
  return data;
}

export async function getDocuments(): Promise<Document[]> {
  const { data } = await api.get("/documents");
  return data;
}

export async function deleteDocument(docId: string): Promise<void> {
  await api.delete(`/documents/${docId}`);
}

export async function getGraph(
  limit: number = 500,
  types?: string[]
): Promise<GraphData> {
  const params: Record<string, unknown> = { limit };
  if (types?.length) {
    params.types = types;
  }
  const { data } = await api.get("/graph", { params });
  return data;
}

export async function clearGraph(): Promise<void> {
  await api.delete("/graph/clear");
}

export async function getGraphStats(): Promise<GraphStats> {
  const { data } = await api.get("/graph/stats");
  return data;
}

export async function searchNodes(
  query: string,
  limit: number = 20
): Promise<GraphNode[]> {
  const { data } = await api.get("/graph/search", {
    params: { q: query, limit },
  });
  return data;
}

export async function getNodeNeighbors(
  nodeName: string,
  depth: number = 1
): Promise<GraphData> {
  const { data } = await api.get(
    `/graph/node/${encodeURIComponent(nodeName)}/neighbors`,
    { params: { depth } }
  );
  return data;
}

export async function askQuestion(request: QARequest): Promise<QAResponse> {
  const { data } = await api.post("/qa", request);
  return data;
}

export function createExtractionSSE(
  docId: string,
  onProgress: (data: { chunk: number; total: number; triplets_so_far: number }) => void,
  onComplete: (data: { total_triplets: number; total_chunks: number }) => void,
  onError: (error: string) => void
): EventSource {
  const es = new EventSource(`${API_BASE}/extraction/${docId}/status`);

  es.addEventListener("progress", (e) => {
    onProgress(JSON.parse(e.data));
  });

  es.addEventListener("complete", (e) => {
    onComplete(JSON.parse(e.data));
    es.close();
  });

  es.addEventListener("error", (e) => {
    if (e instanceof MessageEvent) {
      onError(JSON.parse(e.data).error);
    } else {
      onError("Connection lost");
    }
    es.close();
  });

  return es;
}
