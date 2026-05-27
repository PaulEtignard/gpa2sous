/**
 * Generic bank-statement PDF parser.
 *
 * Strategy:
 *   1. Use pdfjs-dist to extract text *with positions* page by page.
 *   2. Group items into visual lines by their Y coordinate.
 *   3. Detect column header positions ("Débit" / "Crédit") to decide whether
 *      an amount on a transaction line is an expense or income — the text
 *      alone is ambiguous (e.g. "VIR INST MLE MARTIN LEA" appears as both
 *      depending on direction).
 *   4. Treat any line starting with a date as a new transaction; lines that
 *      don't start with a date are description continuations.
 *
 * Fallbacks when column headers can't be found:
 *   - Use right-most amount on the line.
 *   - Default to a debit (negative) unless the line text matches strong
 *     income keywords (VIR SALAIRE, VIR CAF, VIR CPAM…).
 */

import type { NormalizedTransaction } from "@/lib/csv/types";

// pdfjs-dist is dynamically imported on first use to keep the initial bundle small.
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
async function loadPdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((mod) => {
      // Worker via CDN — bundler-agnostic, no /public setup needed
      mod.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${mod.version}/build/pdf.worker.min.mjs`;
      return mod;
    });
  }
  return pdfjsPromise;
}

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface Line {
  y: number;
  items: TextItem[];
}

export interface PdfParseResult {
  transactions: NormalizedTransaction[];
  diagnostic: {
    pages: number;
    lines: number;
    bank: string | null;
    columnsDetected: boolean;
    errors: string[];
  };
}

const DATE_RE = /^\d{2}\/\d{2}\/\d{4}$/;
const AMOUNT_RE = /^[+-]?\d{1,3}(?:[.\s]\d{3})*,\d{2}$/;

const INCOME_KEYWORDS = [
  "vir la poste",
  "vir caf",
  "vir cpam",
  "vir complementaire sante",
  "vir ep salariale",
  "salaire",
  "salary",
  "remboursement",
];

export async function parsePDFFile(file: File): Promise<PdfParseResult> {
  const buffer = await file.arrayBuffer();
  const pdfjsLib = await loadPdfjs();
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

  const allLines: Line[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const items = (content.items as unknown as TextItem[]).filter(
      (it) => typeof it.str === "string" && it.str.trim().length > 0,
    );
    allLines.push(...groupByLine(items));
  }

  // Detect column positions from any line containing both "Débit" and "Crédit"
  const { debitX, creditX, midX } = findColumnPositions(allLines);
  const columnsDetected = debitX > 0 && creditX > 0;

  const transactions: NormalizedTransaction[] = [];
  const errors: string[] = [];
  let current: { date: string; descriptionParts: string[]; amount: number | null } | null = null;

  const flush = () => {
    if (current && current.amount !== null && Number.isFinite(current.amount)) {
      const description = current.descriptionParts
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
      transactions.push({
        bookedAt: toISO(current.date),
        description: description || "(sans libellé)",
        amount: current.amount,
        rawLabel: description,
      });
    }
    current = null;
  };

  for (const line of allLines) {
    const text = line.items.map((it) => it.str).join(" ").trim();
    if (isNoise(text)) continue;

    const firstStr = line.items[0].str.trim();
    if (DATE_RE.test(firstStr)) {
      flush();

      // Find the rightmost amount on the line — closest to a column header.
      const amountItems = line.items.filter((it) => AMOUNT_RE.test(it.str.trim()));
      if (amountItems.length === 0) {
        // Header row or noise — skip
        continue;
      }
      const amountItem = amountItems[amountItems.length - 1];
      const rawAmount = parseFRAmount(amountItem.str.trim());

      let sign = -1;
      if (columnsDetected) {
        const itemMidX = amountItem.transform[4] + amountItem.width / 2;
        sign = itemMidX < midX ? -1 : 1;
      } else {
        const lower = text.toLowerCase();
        if (INCOME_KEYWORDS.some((kw) => lower.includes(kw))) sign = 1;
      }

      // Description = items between the dates and the amount.
      // Skip date(s) at the start and the amount at the end.
      const dateCount = line.items.slice(0, 2).filter((it) => DATE_RE.test(it.str.trim())).length;
      const amountIdx = line.items.indexOf(amountItem);
      const descriptionStr = line.items
        .slice(dateCount, amountIdx)
        .map((it) => it.str.trim())
        .filter(Boolean)
        .join(" ")
        .trim();

      current = {
        date: firstStr,
        descriptionParts: descriptionStr ? [descriptionStr] : [],
        amount: sign * rawAmount,
      };
    } else if (current) {
      // Continuation of the previous transaction's description.
      current.descriptionParts.push(text);
    }
  }

  flush();

  if (transactions.length === 0 && allLines.length === 0) {
    errors.push("Aucun texte extrait — le PDF est probablement scanné (image). Utilise plutôt un export CSV.");
  } else if (transactions.length === 0) {
    errors.push("Aucune transaction détectée. Le format de ce PDF n'est pas encore reconnu.");
  }

  return {
    transactions,
    diagnostic: {
      pages: pdf.numPages,
      lines: allLines.length,
      bank: detectBank(allLines),
      columnsDetected,
      errors,
    },
  };
}

function groupByLine(items: TextItem[], tolerance = 2): Line[] {
  const lines: Line[] = [];
  for (const item of items) {
    const y = item.transform[5];
    let existing = lines.find((l) => Math.abs(l.y - y) < tolerance);
    if (!existing) {
      existing = { y, items: [] };
      lines.push(existing);
    }
    existing.items.push(item);
  }
  for (const line of lines) {
    line.items.sort((a, b) => a.transform[4] - b.transform[4]);
  }
  // Sort lines top-to-bottom — in PDF coordinates Y origin is bottom-left,
  // so larger Y = higher on the page.
  lines.sort((a, b) => b.y - a.y);
  return lines;
}

function findColumnPositions(lines: Line[]): { debitX: number; creditX: number; midX: number } {
  for (const line of lines) {
    const debit = line.items.find((it) => /^d[éeè]bit\b/i.test(it.str.trim()));
    const credit = line.items.find((it) => /^cr[éeè]dit\b/i.test(it.str.trim()));
    if (debit && credit) {
      const dX = debit.transform[4] + debit.width / 2;
      const cX = credit.transform[4] + credit.width / 2;
      return { debitX: dX, creditX: cX, midX: (dX + cX) / 2 };
    }
  }
  return { debitX: -1, creditX: -1, midX: -1 };
}

function isNoise(text: string): boolean {
  return (
    /^SOLDE\s+(CR[ÉE]D|D[ÉE]B)/i.test(text) ||
    /Suite\s+au\s+verso/i.test(text) ||
    /^Page\s+\d+/i.test(text) ||
    /TITULAIRE\s*\(/i.test(text) ||
    /^Date\s+Date\s+valeur/i.test(text) ||
    /^R[ée]f\s*:/i.test(text) ||
    /^IBAN\s*:/i.test(text) ||
    /^RELEVE\s+ET\s+INFORMATIONS/i.test(text) ||
    /^SITUATION\s+DE\s+VOS/i.test(text) ||
    /^TOTAL\s+(MENSUEL|DES\s+FRAIS)/i.test(text) ||
    /^N[°o]\s+de\s+compte/i.test(text) ||
    /^Num[ée]ro\s+Libell/i.test(text)
  );
}

function parseFRAmount(str: string): number {
  // French format: thousands separator is "." or non-breaking space; decimal is ","
  const cleaned = str.replace(/[\s. ]/g, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? Math.abs(n) : NaN;
}

function toISO(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("/");
  return `${y}-${m}-${d}`;
}

function detectBank(lines: Line[]): string | null {
  const allText = lines.flatMap((l) => l.items.map((i) => i.str)).join(" ");
  if (/cr[ée]dit\s*mutuel/i.test(allText)) return "Crédit Mutuel";
  if (/cic\b/i.test(allText)) return "CIC";
  if (/BNP\s*Paribas/i.test(allText)) return "BNP Paribas";
  if (/cr[ée]dit\s*agricole/i.test(allText)) return "Crédit Agricole";
  if (/caisse\s+d[''’]?[ée]pargne/i.test(allText)) return "Caisse d'Épargne";
  if (/soci[ée]t[ée]\s+g[ée]n[ée]rale/i.test(allText)) return "Société Générale";
  if (/banque\s+postale/i.test(allText)) return "La Banque Postale";
  if (/boursorama/i.test(allText)) return "Boursorama";
  if (/fortuneo/i.test(allText)) return "Fortuneo";
  if (/revolut/i.test(allText)) return "Revolut";
  if (/n26/i.test(allText)) return "N26";
  return null;
}
