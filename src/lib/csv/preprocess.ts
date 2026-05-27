/**
 * Bank-specific CSV pre-processors.
 *
 * Called after raw parsing but before column auto-detection.
 * Each preprocessor normalises a proprietary layout into a canonical
 * 4-column table: [Date, Description, Amount, Currency]
 * so that the generic column-detection and normalizeRows pipeline
 * can handle it without changes.
 */

// ── Revolut ─────────────────────────────────────────────────────────────────
// Export format (en-us locale):
//   Type, Product, Started Date, Completed Date, Description,
//   Amount, Fee, Currency, State, Balance

function isRevolutFormat(headers: string[]): boolean {
  const norm = new Set(headers.map((h) => h.toLowerCase().trim()));
  return (
    norm.has("state") &&
    norm.has("fee") &&
    (norm.has("started date") || norm.has("completed date"))
  );
}

function preprocessRevolut(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } {
  const h = headers.map((x) => x.toLowerCase().trim());
  const col = (name: string) => h.indexOf(name);

  const typeIdx      = col("type");
  const startedIdx   = col("started date");
  const completedIdx = col("completed date");
  const descIdx      = col("description");
  const amountIdx    = col("amount");
  const feeIdx       = col("fee");
  const stateIdx     = col("state");
  const currencyIdx  = col("currency");

  const out = rows
    .filter((row) => {
      // Skip REVERTED transactions — they cancel out and net to zero
      const state = (row[stateIdx] ?? "").toUpperCase();
      return state !== "REVERTED";
    })
    .map((row) => {
      const type    = (row[typeIdx] ?? "").toLowerCase();
      const state   = (row[stateIdx] ?? "").toUpperCase();
      let amountStr = (row[amountIdx] ?? "0").trim();
      const feeStr  = (row[feeIdx] ?? "0").trim();
      const feeVal  = parseFloat(feeStr.replace(",", ".")) || 0;

      // "Charge" rows (e.g. Metal plan fee): Amount=0, Fee=actual cost
      if (
        type === "charge" &&
        Math.abs(parseFloat(amountStr.replace(",", ".")) || 0) < 0.001 &&
        Math.abs(feeVal) > 0
      ) {
        amountStr = String(-Math.abs(feeVal));
      }

      // For settled tx use Completed Date; for PENDING use Started Date
      const completedDate = (row[completedIdx] ?? "").trim();
      const startedDate   = (row[startedIdx] ?? "").trim();
      const date = (state === "PENDING" || !completedDate) ? startedDate : completedDate;

      const description = (row[descIdx] ?? "").trim();
      const currency    = (row[currencyIdx] ?? "EUR").trim();

      return [date, description, amountStr, currency];
    });

  return {
    headers: ["Date", "Description", "Amount", "Currency"],
    rows: out,
  };
}

// ── Public entry point ───────────────────────────────────────────────────────

/**
 * Detect if the CSV belongs to a known proprietary bank format and, if so,
 * transform it into a generic 4-column layout.  Returns null when no known
 * format is detected (= generic path).
 */
export function detectAndPreprocess(
  headers: string[],
  rows: string[][],
): { headers: string[]; rows: string[][] } | null {
  if (isRevolutFormat(headers)) return preprocessRevolut(headers, rows);
  return null;
}
