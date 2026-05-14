import axios from "axios";
import type {
  Document,
  EntityType,
  EntityTypeCreate,
  EntityTypeUpdate,
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
  language: string = "auto"
): Promise<{ id: string; filename: string; status: string }> {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("language", language);
  const { data } = await api.post("/documents", formData);
  return data;
}

export async function uploadText(
  text: string,
  language: string = "auto"
): Promise<{ id: string; filename: string; status: string }> {
  const { data } = await api.post("/documents/text", { text, language });
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

export async function deleteNode(name: string): Promise<void> {
  await api.delete(`/graph/node/${encodeURIComponent(name)}`);
}

export async function askQuestion(request: QARequest): Promise<QAResponse> {
  const { data } = await api.post("/qa", request);
  return data;
}

export async function getEntityTypes(): Promise<EntityType[]> {
  const { data } = await api.get("/entity-types");
  return data;
}

export async function getDefaultEntityTypes(): Promise<EntityType[]> {
  const { data } = await api.get("/entity-types/defaults");
  return data;
}

export async function createEntityType(
  payload: EntityTypeCreate
): Promise<EntityType> {
  const { data } = await api.post("/entity-types", payload);
  return data;
}

export async function updateEntityType(
  name: string,
  payload: EntityTypeUpdate
): Promise<EntityType> {
  const { data } = await api.patch(
    `/entity-types/${encodeURIComponent(name)}`,
    payload
  );
  return data;
}

export async function deleteEntityType(name: string): Promise<void> {
  await api.delete(`/entity-types/${encodeURIComponent(name)}`);
}

export async function resetEntityTypes(): Promise<EntityType[]> {
  const { data } = await api.post("/entity-types/reset");
  return data;
}

export async function triggerReExtract(): Promise<{
  status: string;
  total_docs: number;
}> {
  const { data } = await api.post("/graph/re-extract");
  return data;
}

export interface TypesSnapshot {
  is_consistent: boolean;
  stale_doc_ids: string[];
  current_type_names: string[];
}

export async function getTypesSnapshot(): Promise<TypesSnapshot> {
  const { data } = await api.get("/graph/types-snapshot");
  return data;
}

export interface ReExtractProgress {
  completed_docs: number;
  skipped_docs: number;
  total_docs: number;
  current_doc_id: string | null;
  current_doc_chunk: number;
  current_doc_total_chunks: number;
  triplets_so_far: number;
}

export interface ReExtractComplete extends ReExtractProgress {
  errors: string[];
}

export function createReExtractSSE(
  onProgress: (data: ReExtractProgress) => void,
  onComplete: (data: ReExtractComplete) => void,
  onError: (error: string) => void
): EventSource {
  const es = new EventSource(`${API_BASE}/graph/re-extract/status`);

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
