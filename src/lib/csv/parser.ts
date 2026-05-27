import Papa from "papaparse";
import type {
  ColumnMapping,
  DetectedFormat,
  NormalizedTransaction,
  ParsedTable,
} from "./types";
import { decodeBuffer, detectEncoding } from "./encoding";
import { detectDelimiter, detectSkipLines } from "./delimiter";
import { detectDecimalSeparator } from "./amount";
import { detectDateFormat, parseDate, toISO } from "./date";
import { detectColumns, rowAmount } from "./columns";
import { detectAndPreprocess } from "./preprocess";

/** Top-level: parse a file (any encoding, any delimiter) into a ParsedTable. */
export async function parseCSVFile(file: File): Promise<ParsedTable> {
  const buffer = await file.arrayBuffer();
  return parseCSVBuffer(buffer);
}

export function parseCSVBuffer(buffer: ArrayBuffer): ParsedTable {
  const encoding = detectEncoding(buffer);
  const text = decodeBuffer(buffer, encoding);
  return parseCSVText(text, encoding);
}

export function parseCSVText(text: string, encoding: DetectedFormat["encoding"] = "utf-8"): ParsedTable {
  const delimiter = detectDelimiter(text);
  const skipLines = detectSkipLines(text, delimiter);

  const slicedText = skipLines > 0
    ? text.split(/\r?\n/).slice(skipLines).join("\n")
    : text;

  const result = Papa.parse<string[]>(slicedText, {
    delimiter,
    skipEmptyLines: "greedy",
    transform: (v) => (typeof v === "string" ? v.trim() : v),
  });

  let allRows: string[][] = result.data.filter((r) => Array.isArray(r) && r.some((c) => c && c.length > 0));

  let { hasHeader, headers, rows } = extractHeader(allRows);

  // Apply bank-specific pre-processing (Revolut, etc.) before column detection
  const preprocessed = detectAndPreprocess(headers, rows);
  if (preprocessed) {
    headers = preprocessed.headers;
    rows    = preprocessed.rows;
    hasHeader = true; // preprocessors always emit a header row
  }

  const sampleAmountCells = rows.slice(0, 50).flatMap((r) => r);
  const decimalSeparator = detectDecimalSeparator(sampleAmountCells);

  const dateSamplesByColumn = (() => {
    const colCount = headers.length || (rows[0]?.length ?? 0);
    const arr: string[][] = Array.from({ length: colCount }, () => []);
    for (const r of rows.slice(0, 30)) {
      for (let c = 0; c < colCount; c++) arr[c].push(r[c] ?? "");
    }
    return arr;
  })();

  const dateFormat = (() => {
    let best = "DD/MM/YYYY" as DetectedFormat["dateFormat"];
    let bestScore = 0;
    for (const col of dateSamplesByColumn) {
      const fmt = detectDateFormat(col);
      const score = col.filter((v) => parseDate(v, fmt)).length;
      if (score > bestScore) {
        bestScore = score;
        best = fmt;
      }
    }
    return best;
  })();

  const mapping = detectColumns(headers, rows, decimalSeparator);

  return {
    headers,
    rows,
    format: {
      encoding,
      delimiter,
      decimalSeparator,
      dateFormat,
      hasHeader,
      skipLines,
    },
    mapping,
  };
}

/**
 * Determine whether the first row is a header by checking whether ANY cell
 * looks like a date or amount. Headers should be pure text.
 */
function extractHeader(allRows: string[][]): {
  hasHeader: boolean;
  headers: string[];
  rows: string[][];
} {
  if (allRows.length === 0) {
    return { hasHeader: false, headers: [], rows: [] };
  }

  const first = allRows[0];
  const looksLikeHeader = first.every((cell) => {
    if (!cell) return true;
    const c = cell.trim();
    if (c.length === 0) return true;
    if (/^[-−–+(]?\s*[€$£¥]?\s*\d/.test(c)) return false;
    if (/^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(c)) return false;
    if (/^\d{4}-\d{2}-\d{2}/.test(c)) return false;
    return true;
  });

  if (looksLikeHeader && allRows.length > 1) {
    return { hasHeader: true, headers: first, rows: allRows.slice(1) };
  }
  return { hasHeader: false, headers: [], rows: allRows };
}

/**
 * Apply a (possibly user-edited) mapping to the parsed table and return
 * normalized transactions ready to insert.
 */
export function normalizeRows(
  table: ParsedTable,
  overrides?: Partial<ColumnMapping>,
): { transactions: NormalizedTransaction[]; errors: { row: number; reason: string }[] } {
  const mapping: ColumnMapping = { ...table.mapping, ...overrides } as ColumnMapping;
  const { decimalSeparator, dateFormat } = table.format;

  const transactions: NormalizedTransaction[] = [];
  const errors: { row: number; reason: string }[] = [];

  table.rows.forEach((row, i) => {
    const rawDate = row[mapping.dateColumn] ?? "";
    const date = parseDate(rawDate, dateFormat);
    if (!date) {
      errors.push({ row: i, reason: `Date invalide: "${rawDate}"` });
      return;
    }

    const amount = rowAmount(row, mapping, decimalSeparator);
    if (!Number.isFinite(amount) || amount === 0) {
      errors.push({ row: i, reason: `Montant invalide ou nul` });
      return;
    }

    const description = (row[mapping.descriptionColumn] ?? "").trim() || "(sans libellé)";

    transactions.push({
      bookedAt: toISO(date),
      description,
      amount,
      rawLabel: description,
    });
  });

  return { transactions, errors };
}
