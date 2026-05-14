import { useQuery } from "@tanstack/react-query";
import { getGraphStats } from "../api/client";
import { useEntityTypes } from "../hooks/useEntityTypes";
import { ORPHAN_TYPE_COLOR } from "../types";

export default function FilterPanel() {
  const { types, update, create, isKnown } = useEntityTypes();

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: getGraphStats,
  });

  const orphanTypes = (stats?.types_distribution ?? []).filter(
    (t) => !isKnown(t.type as string)
  );

  const toggle = async (name: string, visible: boolean) => {
    await update({ name, payload: { visible: !visible } });
  };

  const addOrphanToRegistry = async (name: string) => {
    await create({ name });
  };

  if (types.length === 0 && orphanTypes.length === 0) return null;

  return (
    <div className="panel">
      <h3>Фильтр по типу</h3>
      <div className="checkbox-group">
        {types.map((t) => (
          <label key={t.name}>
            <input
              type="checkbox"
              checked={t.visible}
              onChange={() => toggle(t.name, t.visible)}
            />
            <span className="type-dot" style={{ background: t.color }} />
            {t.label}
          </label>
        ))}
      </div>

      {orphanTypes.length > 0 && (
        <>
          <div
            style={{
              marginTop: "0.6rem",
              fontSize: "0.75rem",
              color: "#a6adc8",
              lineHeight: 1.4,
            }}
          >
            Удалённые типы (есть в графе, но не в реестре):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", marginTop: "0.3rem" }}>
            {orphanTypes.map((t) => (
              <div
                key={t.type as string}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.8rem",
                }}
              >
                <span className="type-dot" style={{ background: ORPHAN_TYPE_COLOR }} />
                <span style={{ flex: 1 }}>{t.type as string}</span>
                <span style={{ color: "#6c7086", fontSize: "0.75rem" }}>{t.count}</span>
                <button
                  onClick={() => addOrphanToRegistry(t.type as string)}
                  title="Добавить в реестр"
                  style={{
                    background: "transparent",
                    color: "#a6adc8",
                    fontSize: "0.75rem",
                    padding: "0.1rem 0.4rem",
                  }}
                >
                  +
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
