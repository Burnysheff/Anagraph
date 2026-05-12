import { useState } from "react";
import { askQuestion } from "../api/client";
import type { QAResponse } from "../types";
import { useLocalStorage } from "../utils/useLocalStorage";
import { formatRelative } from "../utils/time";

const EXAMPLE_QUESTIONS = [
  "Какие сущности есть в графе?",
  "Покажи все организации",
  "Какие технологии упоминаются?",
  "Как связаны сущности между собой?",
  "Кто что разработал?",
];

const HISTORY_KEY = "anagraph_qa_history";
const HISTORY_LIMIT = 10;

interface HistoryItem {
  id: string;
  question: string;
  answer: string;
  cypher_query: string;
  method: string;
  timestamp: number;
}

export default function QAPanel() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QAResponse | null>(null);
  const [showCypher, setShowCypher] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [history, setHistory] = useLocalStorage<HistoryItem[]>(HISTORY_KEY, []);

  const handleAsk = async (q?: string) => {
    const text = (q ?? question).trim();
    if (!text || loading) return;
    setQuestion(text);
    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await askQuestion({ question: text });
      setResponse(result);
      const item: HistoryItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        question: text,
        answer: result.answer,
        cypher_query: result.cypher_query,
        method: result.method,
        timestamp: Date.now(),
      };
      setHistory((prev) => [item, ...prev].slice(0, HISTORY_LIMIT));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Не удалось получить ответ");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setResponse(null);
    setError(null);
    setQuestion("");
    setShowCypher(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const restoreFromHistory = (item: HistoryItem) => {
    setQuestion(item.question);
    setResponse({
      answer: item.answer,
      cypher_query: item.cypher_query,
      method: item.method,
      raw_results: [],
    });
    setError(null);
    setHistoryOpen(false);
  };

  const handleClearHistory = () => {
    if (!confirmingClear) {
      setConfirmingClear(true);
      return;
    }
    setHistory([]);
    setConfirmingClear(false);
  };

  return (
    <div
      style={{
        padding: "1rem 1.5rem",
        borderTop: "1px solid #45475a",
        background: "#252536",
        maxHeight: 320,
        overflowY: "auto",
      }}
    >
      {history.length > 0 && (
        <div style={{ marginBottom: "0.5rem" }}>
          <button
            onClick={() => setHistoryOpen(!historyOpen)}
            style={{
              background: "transparent",
              color: "#a6adc8",
              fontSize: "0.8rem",
              padding: "0.25rem 0",
            }}
          >
            {historyOpen ? "▼" : "▶"} История ({history.length})
          </button>
          {historyOpen && (
            <div style={{ marginTop: "0.4rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  onClick={() => restoreFromHistory(item)}
                  style={{
                    padding: "0.4rem 0.5rem",
                    background: "#313244",
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: "0.8rem",
                    display: "flex",
                    gap: "0.5rem",
                    alignItems: "baseline",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#45475a")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#313244")}
                >
                  <span style={{ color: "#6c7086", flexShrink: 0 }}>
                    {formatRelative(item.timestamp)}
                  </span>
                  <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.question}
                  </span>
                </div>
              ))}
              <button
                onClick={handleClearHistory}
                onBlur={() => setConfirmingClear(false)}
                style={{
                  alignSelf: "flex-start",
                  background: "transparent",
                  color: confirmingClear ? "#f38ba8" : "#6c7086",
                  fontSize: "0.75rem",
                  padding: "0.25rem 0",
                }}
              >
                {confirmingClear ? "Точно очистить?" : "Очистить историю"}
              </button>
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "0.5rem" }}>
        <input
          type="text"
          placeholder="Задайте вопрос к графу знаний..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={handleKeyDown}
          style={{ flex: 1 }}
        />
        <button className="btn-primary" onClick={() => handleAsk()} disabled={loading}>
          {loading ? "..." : "Спросить"}
        </button>
        {(response || error) && (
          <button className="btn-secondary" onClick={handleReset}>
            Сбросить
          </button>
        )}
      </div>

      {!response && !loading && !error && (
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
          {EXAMPLE_QUESTIONS.map((eq) => (
            <button
              key={eq}
              onClick={() => handleAsk(eq)}
              style={{
                background: "#313244",
                color: "#a6adc8",
                fontSize: "0.75rem",
                padding: "0.3rem 0.6rem",
                border: "1px solid #45475a",
                borderRadius: 12,
              }}
            >
              {eq}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div style={{ color: "#f38ba8", fontSize: "0.85rem" }}>{error}</div>
      )}

      {response && (
        <div style={{ fontSize: "0.9rem" }}>
          <div style={{ marginBottom: "0.5rem", lineHeight: 1.5 }}>
            {response.answer}
          </div>
          <div>
            <button
              onClick={() => setShowCypher(!showCypher)}
              style={{
                background: "transparent",
                color: "#a6adc8",
                fontSize: "0.8rem",
                padding: "0.25rem 0",
                textDecoration: "underline",
              }}
            >
              {showCypher ? "Скрыть" : "Показать"} Cypher ({response.method})
            </button>
            {showCypher && (
              <pre
                style={{
                  background: "#313244",
                  padding: "0.5rem",
                  borderRadius: 6,
                  fontSize: "0.8rem",
                  color: "#a6adc8",
                  marginTop: "0.25rem",
                  overflowX: "auto",
                }}
              >
                {response.cypher_query}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
