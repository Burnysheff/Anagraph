import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getDocuments, deleteDocument } from "../api/client";
import { formatRelative } from "../utils/time";
import type { Document } from "../types";

interface Props {
  refreshKey: number;
  onChange: () => void;
}

const STATUS_COLORS: Record<Document["status"], { bg: string; label: string }> = {
  pending: { bg: "#f9e2af", label: "ожидает" },
  processing: { bg: "#f9e2af", label: "обработка" },
  completed: { bg: "#a6e3a1", label: "готово" },
  error: { bg: "#f38ba8", label: "ошибка" },
};

export default function DocumentList({ refreshKey, onChange }: Props) {
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: docs } = useQuery({
    queryKey: ["documents", refreshKey],
    queryFn: getDocuments,
    refetchInterval: (query) => {
      const list = query.state.data as Document[] | undefined;
      const inflight = list?.some((d) => d.status === "pending" || d.status === "processing");
      return inflight ? 2000 : false;
    },
  });

  const handleDelete = async (docId: string) => {
    if (confirmingId !== docId) {
      setConfirmingId(docId);
      return;
    }
    setDeletingId(docId);
    try {
      await deleteDocument(docId);
      onChange();
    } finally {
      setDeletingId(null);
      setConfirmingId(null);
    }
  };

  if (!docs || docs.length === 0) return null;

  return (
    <div className="panel">
      <h3>Документы</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
        {docs.map((doc) => {
          const status = STATUS_COLORS[doc.status];
          const confirming = confirmingId === doc.id;
          const deleting = deletingId === doc.id;
          return (
            <div
              key={doc.id}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
                padding: "0.4rem 0.5rem",
                background: "#313244",
                borderRadius: 4,
                fontSize: "0.8rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                }}
              >
                <span
                  style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={doc.filename}
                >
                  {doc.filename}
                </span>
                <button
                  onClick={() => handleDelete(doc.id)}
                  onBlur={() => setConfirmingId(null)}
                  disabled={deleting}
                  style={{
                    background: "transparent",
                    color: confirming ? "#f38ba8" : "#6c7086",
                    fontSize: "0.85rem",
                    padding: "0 0.25rem",
                    fontWeight: confirming ? 600 : 400,
                  }}
                  title={confirming ? "Точно удалить?" : "Удалить"}
                >
                  {deleting ? "..." : confirming ? "✓" : "✕"}
                </button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.75rem" }}>
                <span
                  style={{
                    background: status.bg,
                    color: "#1e1e2e",
                    padding: "0.05rem 0.4rem",
                    borderRadius: 3,
                    fontWeight: 500,
                  }}
                >
                  {status.label}
                </span>
                <span style={{ color: "#6c7086", flex: 1 }}>
                  {formatRelative(doc.created_at)}
                </span>
                {doc.triplets_extracted > 0 && (
                  <span style={{ color: "#a6adc8" }}>{doc.triplets_extracted} трипл.</span>
                )}
              </div>
              {doc.status === "error" && doc.error_message && (
                <div style={{ color: "#f38ba8", fontSize: "0.7rem" }}>
                  {doc.error_message}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
