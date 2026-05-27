import type { Delimiter } from "./types";

const CANDIDATES: Delimiter[] = [";", ",", "\t", "|"];

/**
 * Detect the field delimiter by picking the candidate that produces the most
 * consistent column count across the first ~20 non-empty lines, and prefer
 * candidates that give >1 column.
 */
export function detectDelimiter(text: string): Delimiter {
  const lines = text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .slice(0, 20);

  if (lines.length === 0) return ",";

  let best: Delimiter = ",";
  let bestScore = -Infinity;

  for (const delim of CANDIDATES) {
    const counts = lines.map((l) => countOccurrences(l, delim));
    const avg = counts.reduce((a, b) => a + b, 0) / counts.length;
    if (avg < 1) continue;

    const variance = counts.reduce((sum, n) => sum + (n - avg) ** 2, 0) / counts.length;
    const score = avg - variance * 2;

    if (score > bestScore) {
      bestScore = score;
      best = delim;
    }
  }

  return best;
}

/** Count occurrences of `delim` outside of double-quoted spans. */
function countOccurrences(line: string, delim: string): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (!inQuotes && ch === delim) {
      count++;
    }
  }
  return count;
}

/**
 * Some bank exports prefix the CSV with metadata lines (account info, period,
 * etc.) before the actual header. Detect by finding the first line whose
 * delimiter count matches the modal delimiter count of the file.
 */
export function detectSkipLines(text: string, delimiter: Delimiter): number {
  const lines = text.split(/\r?\n/);
  const counts = lines.map((l) => countOccurrences(l, delimiter));

  const validCounts = counts.filter((c) => c > 0);
  if (validCounts.length === 0) return 0;

  const modal = mode(validCounts);

  for (let i = 0; i < lines.length; i++) {
    if (counts[i] === modal) return i;
  }
  return 0;
}

function mode(arr: number[]): number {
  const freq = new Map<number, number>();
  let best = arr[0];
  let bestCount = 0;
  for (const n of arr) {
    const c = (freq.get(n) ?? 0) + 1;
    freq.set(n, c);
    if (c > bestCount) {
      bestCount = c;
      best = n;
    }
  }
  return best;
}
