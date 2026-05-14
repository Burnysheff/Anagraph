import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEntityTypes } from "../hooks/useEntityTypes";
import { useToast } from "./Toast";
import {
  createReExtractSSE,
  getDocuments,
  getTypesSnapshot,
  triggerReExtract,
  type ReExtractProgress,
} from "../api/client";
import type { EntityType } from "../types";
import { OTHER_TYPE_NAME } from "../types";

const PALETTE = [
  "#89b4fa", "#a6e3a1", "#fab387", "#cba6f7",
  "#f38ba8", "#9399b2", "#94e2d5", "#f5c2e7",
  "#74c7ec", "#b4befe", "#f9e2af", "#eba0ac",
  "#80aaff", "#cae0a0", "#ffc9a0", "#d0a5e8",
];

interface EditState {
  mode: "create" | "edit";
  name: string;
  label: string;
  description: string;
  color: string;
}

export default function EntityTypesPanel() {
  const { types, create, update, remove, reset } = useEntityTypes();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<EditState | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [confirmingReExtract, setConfirmingReExtract] = useState(false);
  const [reExtractProgress, setReExtractProgress] = useState<ReExtractProgress | null>(null);

  const { data: documents = [] } = useQuery({
    queryKey: ["documents"],
    queryFn: getDocuments,
  });
  const reExtractableCount = documents.filter((d) => d.status === "completed").length;

  const { data: snapshot } = useQuery({
    queryKey: ["types-snapshot", types.map((t) => t.name).join(","), documents.length],
    queryFn: getTypesSnapshot,
    enabled: types.length > 0,
  });

  const startEdit = (t: EntityType) => {
    setConfirmingDelete(null);
    setEditing({
      mode: "edit",
      name: t.name,
      label: t.label,
      description: t.description,
      color: t.color,
    });
  };

  const startCreate = () => {
    setConfirmingDelete(null);
    setEditing({
      mode: "create",
      name: "",
      label: "",
      description: "",
      color: PALETTE[types.length % PALETTE.length] ?? PALETTE[0]!,
    });
  };

  const submit = async () => {
    if (!editing) return;
    try {
      if (editing.mode === "create") {
        if (!editing.name.trim()) {
          toast.push("Введите имя типа", "error");
          return;
        }
        await create({
          name: editing.name.trim(),
          label: editing.label.trim() || undefined,
          description: editing.description.trim() || undefined,
          color: editing.color,
        });
        toast.push(`Тип «${editing.name}» добавлен`, "success");
      } else {
        await update({
          name: editing.name,
          payload: {
            label: editing.label,
            description: editing.description,
            color: editing.color,
          },
        });
        toast.push(`Тип «${editing.name}» обновлён`, "success");
      }
      setEditing(null);
    } catch (e) {
      const msg =
        e && typeof e === "object" && "response" in e
          ? // axios error
            ((e as { response?: { data?: { detail?: string } } }).response?.data
              ?.detail ?? "Ошибка")
          : e instanceof Error
            ? e.message
            : "Ошибка";
      toast.push(msg, "error");
    }
  };

  const performDelete = async (name: string) => {
    try {
      await remove(name);
      toast.push(`Тип «${name}» удалён. Узлы остались в графе.`, "success");
      setConfirmingDelete(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Не удалось удалить";
      toast.push(msg, "error");
    }
  };

  const performReset = async () => {
    try {
      await reset();
      toast.push("Реестр сброшен к стандартному набору", "success");
      setConfirmingReset(false);
    } catch (e) {
      toast.push(e instanceof Error ? e.message : "Ошибка сброса", "error");
    }
  };

  const performReExtract = async () => {
    try {
      const { total_docs } = await triggerReExtract();
      setConfirmingReExtract(false);
      setReExtractProgress({
        completed_docs: 0,
        skipped_docs: 0,
        total_docs,
        current_doc_id: null,
        current_doc_chunk: 0,
        current_doc_total_chunks: 0,
        triplets_so_far: 0,
      });
      createReExtractSSE(
        (p) => setReExtractProgress(p),
        (done) => {
          setReExtractProgress(null);
          queryClient.invalidateQueries({ queryKey: ["graph"] });
          queryClient.invalidateQueries({ queryKey: ["stats"] });
          queryClient.invalidateQueries({ queryKey: ["documents"] });
          const errSuffix = done.errors.length > 0
            ? ` (ошибок: ${done.errors.length})`
            : "";
          toast.push(
            `Переизвлечено ${done.completed_docs}/${done.total_docs} документов · ${done.triplets_so_far} триплетов${errSuffix}`,
            "success"
          );
        },
        (err) => {
          setReExtractProgress(null);
          toast.push(err || "Ошибка переизвлечения", "error");
        }
      );
    } catch (e) {
      const msg = e && typeof e === "object" && "response" in e
        ? ((e as { response?: { data?: { detail?: string } } }).response?.data?.detail ?? "Ошибка")
        : e instanceof Error
          ? e.message
          : "Ошибка";
      toast.push(msg, "error");
      setConfirmingReExtract(false);
    }
  };

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h3 style={{ margin: 0 }}>Типы сущностей</h3>
        <button
          onClick={() => setConfirmingReset(true)}
          style={{
            background: "transparent",
            color: "#a6adc8",
            fontSize: "0.75rem",
            padding: "0.25rem 0.5rem",
          }}
          title="Сбросить к стандартным"
        >
          ↺ Сбросить
        </button>
      </div>

      <div style={{ fontSize: "0.75rem", color: "#6c7086", marginTop: "0.4rem", lineHeight: 1.4 }}>
        Изменения применяются к новым документам. Узлы старых типов сохраняются в графе.
      </div>

      {snapshot && !snapshot.is_consistent && (
        <div
          style={{
            marginTop: "0.4rem",
            background: "#332f25",
            border: "1px solid #fab387",
            borderRadius: 6,
            padding: "0.4rem 0.5rem",
            fontSize: "0.72rem",
            color: "#fab387",
            lineHeight: 1.4,
          }}
        >
          {snapshot.stale_doc_ids.length} док. извлечены со старым набором типов. Переизвлеките для синхронизации.
        </div>
      )}

      {reExtractableCount > 0 && (
        <button
          onClick={() => setConfirmingReExtract(true)}
          disabled={reExtractProgress !== null}
          style={{
            marginTop: "0.4rem",
            background: "transparent",
            color: "#89b4fa",
            border: "1px solid #45475a",
            fontSize: "0.75rem",
            padding: "0.3rem 0.6rem",
            width: "100%",
          }}
        >
          ↻ Переизвлечь весь граф ({reExtractableCount} док.)
        </button>
      )}

      {reExtractProgress && (
        <div
          style={{
            marginTop: "0.4rem",
            background: "#252536",
            border: "1px solid #89b4fa",
            borderRadius: 8,
            padding: "0.5rem",
            fontSize: "0.75rem",
            color: "#a6adc8",
          }}
        >
          <div>
            Документ {reExtractProgress.completed_docs + 1}/{reExtractProgress.total_docs}
            {reExtractProgress.current_doc_total_chunks > 0 && (
              <>
                {" · чанк "}
                {reExtractProgress.current_doc_chunk}/
                {reExtractProgress.current_doc_total_chunks}
              </>
            )}
          </div>
          <div>Триплетов: {reExtractProgress.triplets_so_far}</div>
          <div className="progress-bar" style={{ marginTop: "0.3rem" }}>
            <div
              className="progress-bar-fill"
              style={{
                width: `${(reExtractProgress.completed_docs / Math.max(reExtractProgress.total_docs, 1)) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginTop: "0.5rem" }}>
        {types.map((t) => (
          <span
            key={t.name}
            onClick={() => startEdit(t)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.3rem",
              background: "#313244",
              color: "#cdd6f4",
              fontSize: "0.75rem",
              padding: "0.2rem 0.5rem",
              borderRadius: 12,
              cursor: "pointer",
              border: editing?.name === t.name ? "1px solid #89b4fa" : "1px solid transparent",
            }}
          >
            <span className="type-dot" style={{ background: t.color, width: 8, height: 8 }} />
            {t.label}
            {t.name !== OTHER_TYPE_NAME && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmingDelete(t.name);
                }}
                style={{
                  background: "transparent",
                  color: "#a6adc8",
                  fontSize: "0.85rem",
                  padding: 0,
                  lineHeight: 1,
                  marginLeft: "0.15rem",
                }}
                title="Удалить тип"
              >
                ✕
              </button>
            )}
          </span>
        ))}
        <button
          onClick={startCreate}
          style={{
            background: "transparent",
            color: "#a6adc8",
            fontSize: "0.75rem",
            padding: "0.2rem 0.5rem",
            border: "1px dashed #45475a",
            borderRadius: 12,
          }}
        >
          + Добавить тип
        </button>
      </div>

      {editing && (
        <div
          style={{
            marginTop: "0.6rem",
            background: "#252536",
            border: "1px solid #45475a",
            borderRadius: 8,
            padding: "0.6rem",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ marginBottom: "0.4rem", color: "#a6adc8" }}>
            {editing.mode === "create" ? "Новый тип" : `Редактирование «${editing.name}»`}
          </div>

          {editing.mode === "create" && (
            <input
              type="text"
              placeholder="Имя (Drug, Disease, …)"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              style={{ width: "100%", marginBottom: "0.3rem", fontSize: "0.8rem" }}
            />
          )}

          <input
            type="text"
            placeholder="Лейбл (отображаемое название)"
            value={editing.label}
            onChange={(e) => setEditing({ ...editing, label: e.target.value })}
            style={{ width: "100%", marginBottom: "0.3rem", fontSize: "0.8rem" }}
          />

          <textarea
            placeholder="Описание для LLM (опционально, влияет на качество извлечения)"
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            rows={2}
            style={{ width: "100%", marginBottom: "0.3rem", fontSize: "0.8rem", resize: "vertical" }}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.2rem", marginBottom: "0.4rem" }}>
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => setEditing({ ...editing, color: c })}
                style={{
                  width: 18,
                  height: 18,
                  background: c,
                  border: editing.color === c ? "2px solid #cdd6f4" : "2px solid transparent",
                  borderRadius: "50%",
                  padding: 0,
                  cursor: "pointer",
                }}
              />
            ))}
          </div>

          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
            <button
              onClick={() => setEditing(null)}
              style={{
                background: "transparent",
                color: "#a6adc8",
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
              }}
            >
              Отмена
            </button>
            <button
              onClick={submit}
              className="btn-primary"
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
            >
              {editing.mode === "create" ? "Создать" : "Сохранить"}
            </button>
          </div>
        </div>
      )}

      {confirmingDelete && (
        <div
          style={{
            marginTop: "0.6rem",
            background: "#252536",
            border: "1px solid #f38ba8",
            borderRadius: 8,
            padding: "0.6rem",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ color: "#f38ba8", marginBottom: "0.4rem", lineHeight: 1.4 }}>
            Удалить «{confirmingDelete}»? Узлы этого типа останутся в графе серыми.
          </div>
          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
            <button
              onClick={() => setConfirmingDelete(null)}
              style={{
                background: "transparent",
                color: "#a6adc8",
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
              }}
            >
              Отмена
            </button>
            <button
              onClick={() => performDelete(confirmingDelete)}
              style={{
                background: "#f38ba8",
                color: "#1e1e2e",
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
                fontWeight: 600,
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      )}

      {confirmingReExtract && (
        <div
          style={{
            marginTop: "0.6rem",
            background: "#252536",
            border: "1px solid #89b4fa",
            borderRadius: 8,
            padding: "0.6rem",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ color: "#89b4fa", marginBottom: "0.4rem", lineHeight: 1.4 }}>
            Граф будет очищен и пересоздан из {reExtractableCount} док. с текущими типами. Это может занять несколько минут.
          </div>
          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
            <button
              onClick={() => setConfirmingReExtract(false)}
              style={{
                background: "transparent",
                color: "#a6adc8",
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
              }}
            >
              Отмена
            </button>
            <button
              onClick={performReExtract}
              className="btn-primary"
              style={{ fontSize: "0.75rem", padding: "0.3rem 0.6rem" }}
            >
              Запустить
            </button>
          </div>
        </div>
      )}

      {confirmingReset && (
        <div
          style={{
            marginTop: "0.6rem",
            background: "#252536",
            border: "1px solid #fab387",
            borderRadius: 8,
            padding: "0.6rem",
            fontSize: "0.8rem",
          }}
        >
          <div style={{ color: "#fab387", marginBottom: "0.4rem", lineHeight: 1.4 }}>
            Текущий реестр будет заменён на стандартный набор. Узлы старых типов останутся в графе.
          </div>
          <div style={{ display: "flex", gap: "0.4rem", justifyContent: "flex-end" }}>
            <button
              onClick={() => setConfirmingReset(false)}
              style={{
                background: "transparent",
                color: "#a6adc8",
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
              }}
            >
              Отмена
            </button>
            <button
              onClick={performReset}
              style={{
                background: "#fab387",
                color: "#1e1e2e",
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
                fontWeight: 600,
              }}
            >
              Сбросить
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
