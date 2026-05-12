import { useState, useRef, useEffect } from "react";
import { uploadDocument, uploadText, createExtractionSSE } from "../api/client";
import { useToast } from "./Toast";
import { useLocalStorage } from "../utils/useLocalStorage";

interface Props {
  onComplete: () => void;
}

const ALLOWED_EXTENSIONS = ["pdf", "docx", "doc", "txt"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CUSTOM_TYPES_KEY = "anagraph_custom_types";

function validateFile(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return `Неподдерживаемый формат: .${ext}. Разрешены PDF, DOCX, TXT.`;
  }
  if (file.size > MAX_FILE_SIZE) {
    return `Файл слишком большой: ${(file.size / 1024 / 1024).toFixed(1)} МБ. Максимум 10 МБ.`;
  }
  return null;
}

function parseTypes(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
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
  const [dndActive, setDndActive] = useState(false);
  const [typesOpen, setTypesOpen] = useState(false);
  const [customTypes, setCustomTypes] = useLocalStorage<string[]>(CUSTOM_TYPES_KEY, []);
  const [typesInput, setTypesInput] = useState(customTypes.join(", "));
  const fileRef = useRef<HTMLInputElement>(null);
  const dndCounter = useRef(0);
  const toast = useToast();

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
      (data) => {
        setUploading(false);
        setProgress(null);
        setTextValue("");
        toast.push(
          `Добавлено ${data.total_triplets} триплетов из ${data.total_chunks} чанков`,
          "success"
        );
        onComplete();
      },
      (err) => {
        setError(err);
        setUploading(false);
        toast.push(err || "Ошибка извлечения", "error");
      }
    );
  };

  const getActiveTypes = (): string[] | undefined => {
    const fresh = parseTypes(typesInput);
    if (fresh.length > 0 && JSON.stringify(fresh) !== JSON.stringify(customTypes)) {
      setCustomTypes(fresh);
    }
    return fresh.length > 0 ? fresh : undefined;
  };

  const handleFileUpload = async (file: File) => {
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setUploading(true);
    setError(null);
    setProgress(null);
    try {
      const result = await uploadDocument(file, "auto", getActiveTypes());
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
      const result = await uploadText(textValue.trim(), "auto", getActiveTypes());
      startSSE(result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка загрузки");
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const removeType = (type: string) => {
    const next = customTypes.filter((t) => t !== type);
    setCustomTypes(next);
    setTypesInput(next.join(", "));
  };

  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (uploading) return;
      if (!e.dataTransfer?.types.includes("Files")) return;
      dndCounter.current += 1;
      setDndActive(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (uploading) return;
      e.preventDefault();
    };
    const onDragLeave = () => {
      dndCounter.current = Math.max(0, dndCounter.current - 1);
      if (dndCounter.current === 0) setDndActive(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dndCounter.current = 0;
      setDndActive(false);
      if (uploading) return;
      const file = e.dataTransfer?.files[0];
      if (file) handleFileUpload(file);
    };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);

    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
    };
  }, [uploading]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", flex: 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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

        <button
          className="btn-secondary"
          onClick={() => setTypesOpen(!typesOpen)}
          style={{
            background: customTypes.length > 0 ? "#585b70" : "#45475a",
          }}
          title={customTypes.length > 0 ? `Активно: ${customTypes.join(", ")}` : "Свои типы сущностей"}
        >
          Типы {customTypes.length > 0 && `(${customTypes.length})`}
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

      {typesOpen && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {customTypes.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem" }}>
              {customTypes.map((type) => (
                <span
                  key={type}
                  style={{
                    background: "#313244",
                    color: "#cdd6f4",
                    fontSize: "0.75rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: 12,
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  {type}
                  <button
                    onClick={() => removeType(type)}
                    style={{
                      background: "transparent",
                      color: "#a6adc8",
                      fontSize: "0.85rem",
                      padding: 0,
                      lineHeight: 1,
                    }}
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={typesInput}
            onChange={(e) => setTypesInput(e.target.value)}
            onBlur={() => {
              const parsed = parseTypes(typesInput);
              setCustomTypes(parsed);
              setTypesInput(parsed.join(", "));
            }}
            placeholder="Свои типы через запятую: Drug, Disease, Gene"
            style={{ fontSize: "0.85rem" }}
          />
        </div>
      )}

      {dndActive && !uploading && (
        <div className="dnd-overlay">
          <div className="dnd-overlay-message">
            Перетащите файл для анализа<br />
            <span style={{ fontSize: "0.9rem", color: "#a6adc8" }}>
              PDF, DOCX, TXT — до 10 МБ
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
