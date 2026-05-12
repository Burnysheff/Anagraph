import { useState, useCallback } from "react";

const VERSION = 1;

interface Wrapper<T> {
  v: number;
  data: T;
}

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return initial;
      const parsed = JSON.parse(raw) as Wrapper<T>;
      if (parsed.v !== VERSION) return initial;
      return parsed.data;
    } catch {
      return initial;
    }
  });

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? (next as (p: T) => T)(prev) : next;
        try {
          const wrapped: Wrapper<T> = { v: VERSION, data: resolved };
          localStorage.setItem(key, JSON.stringify(wrapped));
        } catch {
          // ignore quota errors
        }
        return resolved;
      });
    },
    [key]
  );

  return [value, set];
}
