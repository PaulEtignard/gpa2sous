/**
 * Merchant keyword extraction.
 *
 * Given a raw transaction description ("Intermarché Dijon", "Burger King",
 * "Payment from M TEO THABUSSOT", …), returns the first significant word that
 * can be used as a fuzzy ilike pattern to identify the same merchant in other
 * transactions.
 *
 * Rules:
 *  - Split on whitespace and common separators
 *  - Drop tokens that are purely numeric or shorter than 3 chars
 *  - Drop generic stop-words (payment, from, transfer, …)
 *  - Return the first surviving token **with its original casing and accents**
 *    so it can be used directly in a Postgres ILIKE '%keyword%' query
 */

const STOP_WORDS = new Set([
  // French
  "paiement", "virement", "prelevement", "depot", "retrait", "remise",
  "remboursement", "achat", "frais", "commission", "avoir", "vers", "pour",
  "par", "avec", "sur", "chez", "de", "du", "de", "la", "le", "les", "au",
  "aux", "un", "une", "des", "en", "et", "ou", "mr", "mme", "mle", "m",
  // English
  "payment", "transfer", "deposit", "refund", "charge", "fee", "debit",
  "credit", "from", "into", "by", "to", "at", "in", "on", "and", "the",
  "for", "of", "current", "pending", "completed", "direct",
  // Card/banking jargon
  "carte", "cb", "visa", "mastercard", "maestro", "amex", "pay", "pmt",
  "chq", "cheque", "sepa", "iban", "bic", "swift", "ref",
]);

function normalizeForStopCheck(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]/g, "");      // keep only alphanumeric
}

/**
 * Extract the best single keyword from a transaction description.
 * Returns null if no significant word is found.
 */
export function extractMerchantKeyword(description: string): string | null {
  // Split on whitespace and common punctuation/separators
  const tokens = description.split(/[\s\-_*#@,;:!?()[\]{}|/\\]+/);

  for (const raw of tokens) {
    // Remove leading/trailing non-alphanumeric (quotes, dots, etc.)
    const cleaned = raw.replace(/^[^a-zA-ZÀ-ÖØ-öø-ÿ0-9]+|[^a-zA-ZÀ-ÖØ-öø-ÿ0-9]+$/g, "");
    if (cleaned.length < 3) continue;
    if (/^\d+$/.test(cleaned)) continue; // skip pure numbers

    const norm = normalizeForStopCheck(cleaned);
    if (STOP_WORDS.has(norm)) continue;

    // Return the cleaned word preserving original casing/accents
    // so it works correctly in a Postgres ILIKE query
    return cleaned;
  }

  return null;
}
