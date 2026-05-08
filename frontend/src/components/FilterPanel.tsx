import { ENTITY_COLORS, ENTITY_TYPE_LABELS } from "../types";

const ALL_TYPES = Object.keys(ENTITY_COLORS);

interface Props {
  activeTypes: string[];
  onChange: (types: string[]) => void;
}

export default function FilterPanel({ activeTypes, onChange }: Props) {
  const toggle = (type: string) => {
    if (activeTypes.includes(type)) {
      onChange(activeTypes.filter((t) => t !== type));
    } else {
      onChange([...activeTypes, type]);
    }
  };

  return (
    <div className="panel">
      <h3>Фильтр по типу</h3>
      <div className="checkbox-group">
        {ALL_TYPES.map((type) => (
          <label key={type}>
            <input
              type="checkbox"
              checked={activeTypes.length === 0 || activeTypes.includes(type)}
              onChange={() => toggle(type)}
            />
            <span
              className="type-dot"
              style={{ background: ENTITY_COLORS[type] }}
            />
            {ENTITY_TYPE_LABELS[type] ?? type}
          </label>
        ))}
      </div>
    </div>
  );
}
