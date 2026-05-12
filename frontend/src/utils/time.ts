const RTF = new Intl.RelativeTimeFormat("ru", { numeric: "auto" });

const UNITS: { unit: Intl.RelativeTimeFormatUnit; ms: number }[] = [
  { unit: "year", ms: 365 * 24 * 3600 * 1000 },
  { unit: "month", ms: 30 * 24 * 3600 * 1000 },
  { unit: "day", ms: 24 * 3600 * 1000 },
  { unit: "hour", ms: 3600 * 1000 },
  { unit: "minute", ms: 60 * 1000 },
  { unit: "second", ms: 1000 },
];

export function formatRelative(ts: number | string | Date): string {
  const time = typeof ts === "number" ? ts : new Date(ts).getTime();
  const diff = time - Date.now();
  const abs = Math.abs(diff);

  for (const { unit, ms } of UNITS) {
    if (abs >= ms || unit === "second") {
      const value = Math.round(diff / ms);
      return RTF.format(value, unit);
    }
  }
  return RTF.format(0, "second");
}
