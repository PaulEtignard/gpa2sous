export type Encoding = "utf-8" | "windows-1252";
export type Delimiter = "," | ";" | "\t" | "|";
export type DecimalSeparator = "," | ".";

export type AmountMode =
  | { kind: "signed"; column: number }
  | { kind: "debit_credit"; debitColumn: number; creditColumn: number };

export type DateFormat =
  | "DD/MM/YYYY"
  | "DD-MM-YYYY"
  | "DD.MM.YYYY"
  | "MM/DD/YYYY"
  | "YYYY-MM-DD"
  | "YYYY/MM/DD"
  | "DD/MM/YY";

export interface ColumnMapping {
  dateColumn: number;
  descriptionColumn: number;
  amount: AmountMode;
}

export interface DetectedFormat {
  encoding: Encoding;
  delimiter: Delimiter;
  decimalSeparator: DecimalSeparator;
  dateFormat: DateFormat;
  hasHeader: boolean;
  skipLines: number;
}

export interface ParsedTable {
  headers: string[];           // empty array if no header detected
  rows: string[][];            // raw string rows (after skipLines)
  format: DetectedFormat;
  mapping: ColumnMapping;      // best-effort auto-detection — UI can override
}

export interface NormalizedTransaction {
  bookedAt: string;            // ISO YYYY-MM-DD
  description: string;
  amount: number;              // signed, negative = expense
  rawLabel: string;
}
