import type { DecimalSeparator } from "./types";

/**
 * Detect decimal separator across a sample of values.
 *
 * Heuristic: a true decimal separator is followed by exactly 2 digits at the
 * end of the number (cents). The other separator is the thousands grouping.
 */
export function detectDecimalSeparator(samples: string[]): DecimalSeparator {
  let commaDecimalScore = 0;
  let dotDecimalScore = 0;

  for (const raw of samples) {
    const cleaned = raw.trim().replace(/[€$£¥\s]/g, "");
    if (cleaned.length === 0) continue;

    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");

    if (lastComma === -1 && lastDot === -1) continue;

    if (lastComma > lastDot) {
      const tail = cleaned.slice(lastComma + 1);
      if (/^\d{1,2}$/.test(tail)) commaDecimalScore++;
    } else if (lastDot > lastComma) {
      const tail = cleaned.slice(lastDot + 1);
      if (/^\d{1,2}$/.test(tail)) dotDecimalScore++;
    }
  }

  return commaDecimalScore >= dotDecimalScore ? "," : ".";
}

/** Parse a localized amount string into a number. Returns NaN if not parseable. */
export function parseAmount(value: string, decimal: DecimalSeparator): number {
  if (!value) return NaN;

  const trimmed = value.trim();
  if (trimmed.length === 0) return NaN;

  const negative = /^\(.*\)$/.test(trimmed) || /[-−–]/.test(trimmed[0] ?? "");
  let cleaned = trimmed
    .replace(/[€$£¥\s ]/g, "")
    .replace(/[()]/g, "")
    .replace(/^[-−–+]/, "");

  if (decimal === ",") {
    cleaned = cleaned.replace(/\./g, "").replace(",", ".");
  } else {
    cleaned = cleaned.replace(/,/g, "");
  }

  const n = Number(cleaned);
  if (!Number.isFinite(n)) return NaN;
  return negative ? -n : n;
}

/** Tell whether a string looks like an amount under either decimal convention. */
export function looksLikeAmount(value: string): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return /^[-−–+(]?\s*[€$£¥]?\s*\d{1,3}([  .,]\d{3})*([.,]\d{1,2})?\s*[€$£¥]?\)?$/.test(trimmed);
}
