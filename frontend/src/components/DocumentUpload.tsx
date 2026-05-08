import { useState, useRef } from "react";
import { uploadDocument, uploadText, createExtractionSSE } from "../api/client";

interface Props {
  onComplete: () => void;
}

export default function DocumentUpload({ onComplete }: Props) {
  const [uploading, setUploading] = useState(false);
  const [textValue, setTextValue] = useState("");
  const [progress, setProgress] = useState<{
    chunk: number;
    total: number;
    triplets: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const startSSE = (docId: string) => {
    createExtractionSSE(
      docId,
      (data) => {
        setProgress({
          chunk: data.chunk,
          total: data.total,
          triplets: data.triplets_so_far,
        });
      },
      () => {
        setUploading(false);
        setProgress(null);
        setTextValue("");
        onComplete();
      },
      (err) => {
        setError(err);
        setUploading(false);
      }
    );
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    setProgress(null);
    try {
      const result = await uploadDocument(file);
      startSSE(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setUploading(false);
    }
  };

  const handleTextSubmit = async () => {
    if (!textValue.trim() || uploading) return;
    setUploading(true);
    setError(null);
    setProgress(null);
    try {
      const result = await uploadText(textValue.trim());
      startSSE(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,.docx,.txt"
        onChange={handleFileChange}
        style={{ display: "none" }}
      />

      <input
        type="text"
        value={textValue}
        onChange={(e) => setTextValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleTextSubmit();
        }}
        placeholder="Вставьте текст для анализа..."
        disabled={uploading}
        style={{ flex: 1 }}
      />

      <button
        className="btn-primary"
        disabled={!textValue.trim() || uploading}
        onClick={handleTextSubmit}
      >
        {uploading ? "Обработка..." : "Анализировать"}
      </button>

      <button
        className="btn-secondary"
        disabled={uploading}
        onClick={() => fileRef.current?.click()}
      >
        Файл
      </button>

      {progress && progress.total > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <div className="progress-bar" style={{ width: 100 }}>
            <div
              className="progress-bar-fill"
              style={{ width: `${(progress.chunk / progress.total) * 100}%` }}
            />
          </div>
          <span style={{ fontSize: "0.8rem", color: "#a6adc8", whiteSpace: "nowrap" }}>
            {progress.chunk}/{progress.total} | {progress.triplets} триплетов
          </span>
        </div>
      )}

      {error && (
        <span style={{ fontSize: "0.8rem", color: "#f38ba8", whiteSpace: "nowrap" }}>{error}</span>
      )}
    </div>
  );
}
