import type { ColumnMapping, DecimalSeparator } from "./types";
import { looksLikeAmount, parseAmount } from "./amount";
import { looksLikeDate } from "./date";

const DATE_HEADERS = [
  "date",
  "date opération",
  "date operation",
  "date de l'opération",
  "date valeur",
  "value date",
  "booking date",
  "trans. date",
  "transaction date",
  "posted",
  "datum",
];

const DESC_HEADERS = [
  "libellé",
  "libelle",
  "description",
  "label",
  "narrative",
  "memo",
  "details",
  "détails",
  "objet",
  "wording",
  "name",
  "merchant",
  "tiers",
  "destinataire",
];

const AMOUNT_HEADERS = [
  "montant",
  "amount",
  "value",
  "valeur",
  "somme",
  "operation amount",
];

const DEBIT_HEADERS = ["débit", "debit", "withdrawal", "sortie", "out"];
const CREDIT_HEADERS = ["crédit", "credit", "deposit", "entrée", "in"];
const BALANCE_HEADERS = ["solde", "balance", "running balance", "saldo"];

/**
 * Infer the role of each column from headers + content sampling.
 *
 * Returns a best-effort mapping. The UI lets the user override this if any
 * column is wrong (e.g. when a bank's "amount" column is actually a running
 * balance, or when the description spans multiple columns).
 */
export function detectColumns(
  headers: string[],
  rows: string[][],
  decimal: DecimalSeparator,
): ColumnMapping {
  const headerLower = headers.map((h) => normalize(h));
  const colCount = Math.max(headers.length, ...rows.map((r) => r.length));
  const samples = sampleColumns(rows, colCount, 30);

  const dateColumn = pickFirst(
    findByHeader(headerLower, DATE_HEADERS),
    findByContent(samples, (vals) => ratioMatching(vals, looksLikeDate)),
  );

  const balanceColumn = findByHeader(headerLower, BALANCE_HEADERS);

  const debitColumn = findByHeader(headerLower, DEBIT_HEADERS);
  const creditColumn = findByHeader(headerLower, CREDIT_HEADERS);

  let amountColumn = findByHeader(headerLower, AMOUNT_HEADERS);
  if (amountColumn === -1) {
    amountColumn = findByContent(samples, (vals, idx) => {
      if (idx === dateColumn || idx === balanceColumn) return 0;
      const amountRatio = ratioMatching(vals, looksLikeAmount);
      const hasNeg = vals.some((v) => /[-−–(]/.test(v.trim()));
      return amountRatio > 0.7 ? amountRatio + (hasNeg ? 0.3 : 0) : 0;
    });
  }

  let amount: ColumnMapping["amount"];
  if (debitColumn !== -1 && creditColumn !== -1) {
    amount = { kind: "debit_credit", debitColumn, creditColumn };
  } else if (amountColumn !== -1) {
    amount = { kind: "signed", column: amountColumn };
  } else {
    amount = { kind: "signed", column: -1 };
  }

  const usedColumns = new Set<number>([
    dateColumn,
    balanceColumn,
    amount.kind === "signed" ? amount.column : amount.debitColumn,
    amount.kind === "debit_credit" ? amount.creditColumn : -1,
  ]);

  const descriptionColumn = pickFirst(
    findByHeader(headerLower, DESC_HEADERS),
    findByContent(samples, (vals, idx) => {
      if (usedColumns.has(idx)) return 0;
      const avgLen = vals.reduce((s, v) => s + v.length, 0) / Math.max(1, vals.length);
      const nonAmount = 1 - ratioMatching(vals, looksLikeAmount);
      return avgLen * nonAmount;
    }),
  );

  return { dateColumn, descriptionColumn, amount };
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}

function findByHeader(headers: string[], targets: string[]): number {
  for (let i = 0; i < headers.length; i++) {
    for (const t of targets) {
      if (headers[i] === t || headers[i].includes(t)) return i;
    }
  }
  return -1;
}

function findByContent(
  samples: string[][],
  scorer: (values: string[], colIndex: number) => number,
): number {
  let bestIdx = -1;
  let bestScore = 0;
  for (let i = 0; i < samples.length; i++) {
    const score = scorer(samples[i], i);
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function sampleColumns(rows: string[][], colCount: number, max: number): string[][] {
  const cols: string[][] = Array.from({ length: colCount }, () => []);
  const limit = Math.min(rows.length, max);
  for (let r = 0; r < limit; r++) {
    for (let c = 0; c < colCount; c++) {
      cols[c].push(rows[r][c] ?? "");
    }
  }
  return cols;
}

function ratioMatching(values: string[], predicate: (s: string) => boolean): number {
  const nonEmpty = values.filter((v) => v && v.trim().length > 0);
  if (nonEmpty.length === 0) return 0;
  const matches = nonEmpty.filter(predicate).length;
  return matches / nonEmpty.length;
}

function pickFirst(...candidates: number[]): number {
  for (const c of candidates) if (c !== -1) return c;
  return -1;
}

/** Compute the signed amount of a row given the mapping + decimal separator. */
export function rowAmount(row: string[], mapping: ColumnMapping, decimal: DecimalSeparator): number {
  if (mapping.amount.kind === "signed") {
    return parseAmount(row[mapping.amount.column] ?? "", decimal);
  }

  const debit = parseAmount(row[mapping.amount.debitColumn] ?? "", decimal);
  const credit = parseAmount(row[mapping.amount.creditColumn] ?? "", decimal);

  const d = Number.isFinite(debit) ? debit : 0;
  const c = Number.isFinite(credit) ? credit : 0;

  if (d !== 0) return -Math.abs(d);
  if (c !== 0) return Math.abs(c);
  return NaN;
}
