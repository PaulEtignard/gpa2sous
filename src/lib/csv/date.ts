import type { DateFormat } from "./types";

const FORMATS: { format: DateFormat; regex: RegExp; parts: [number, number, number] }[] = [
  // [year, month, day] = capture group indices
  { format: "YYYY-MM-DD", regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/, parts: [1, 2, 3] },
  { format: "YYYY/MM/DD", regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/, parts: [1, 2, 3] },
  { format: "DD/MM/YYYY", regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, parts: [3, 2, 1] },
  { format: "DD-MM-YYYY", regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/, parts: [3, 2, 1] },
  { format: "DD.MM.YYYY", regex: /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/, parts: [3, 2, 1] },
  { format: "MM/DD/YYYY", regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, parts: [3, 1, 2] },
  { format: "DD/MM/YY", regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/, parts: [3, 2, 1] },
];

/** Strip an optional time component so datetime strings parse as dates. */
function stripTime(value: string): string {
  // "2026-03-31 13:08:39" → "2026-03-31"
  // "2026-03-31T13:08:39Z" → "2026-03-31"
  return value.trim().replace(/[T ]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/, "");
}

export function looksLikeDate(value: string): boolean {
  if (!value) return false;
  const trimmed = stripTime(value.trim());
  return FORMATS.some(({ regex }) => regex.test(trimmed));
}

/**
 * Detect the most-likely date format from a sample column. Tries every format
 * and picks the one with the most valid parses (calendar-valid). For ambiguous
 * DD/MM vs MM/DD (all samples have day ≤ 12), prefers DD/MM (French default).
 */
export function detectDateFormat(samples: string[]): DateFormat {
  let best: DateFormat = "DD/MM/YYYY";
  let bestScore = -1;

  for (const { format } of FORMATS) {
    let score = 0;
    let ambiguousDdMm = true;

    for (const sample of samples) {
      const parsed = parseDate(sample, format);
      if (parsed) {
        score++;
        const day = parsed.getUTCDate();
        const month = parsed.getUTCMonth() + 1;
        if (day > 12 || month > 12) ambiguousDdMm = false;
      }
    }

    if (format === "MM/DD/YYYY" && ambiguousDdMm) {
      score -= 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = format;
    }
  }

  return best;
}

export function parseDate(value: string, format: DateFormat): Date | null {
  if (!value) return null;
  const trimmed = stripTime(value.trim());

  const spec = FORMATS.find((f) => f.format === format);
  if (!spec) return null;

  const m = spec.regex.exec(trimmed);
  if (!m) return null;

  let year = parseInt(m[spec.parts[0]], 10);
  const month = parseInt(m[spec.parts[1]], 10);
  const day = parseInt(m[spec.parts[2]], 10);

  if (year < 100) year += year >= 70 ? 1900 : 2000;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return d;
}

export function toISO(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
