import { useState } from "react";
import { askQuestion } from "../api/client";
import type { QAResponse } from "../types";

const EXAMPLE_QUESTIONS = [
  "Какие сущности есть в графе?",
  "Покажи все организации",
  "Какие технологии упоминаются?",
  "Как связаны сущности между собой?",
  "Кто что разработал?",
];

export default function QAPanel() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QAResponse | null>(null);
  const [showCypher, setShowCypher] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div
      style={{
        padding: "1rem 1.5rem",
        borderTop: "1px solid #45475a",
        background: "#252536",
        maxHeight: 300,
        overflowY: "auto",
      }}
    >
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
