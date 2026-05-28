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
  // Card/banking jargon + bank abbreviations
  "carte", "cb", "visa", "mastercard", "maestro", "amex", "pay", "pmt",
  "chq", "cheque", "sepa", "iban", "bic", "swift", "ref", "prlv", "vir",
  "inst", "instant", "ecom", "tpe", "dab", "atm", "fact", "rib", "txn",
  // Currencies
  "eur", "euro", "euros", "usd", "gbp", "chf", "cad", "jpy", "dollar",
  "dollars", "pounds", "currency",
  // Country codes & generic locations (often appear in bank descriptions)
  "fr", "be", "lu", "ch", "uk", "us", "ca", "es", "it", "de", "nl", "pt",
  "fra", "ger", "esp", "ita", "gbr", "france", "paris", "lyon", "lille",
]);

function normalizeForStopCheck(word: string): string {
  return word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/[^a-z0-9]/g, "");      // keep only alphanumeric
}

/**
 * True when a token looks like a card mask or bank reference number:
 *   X5327, XXXX1234, *1234, ****1234, 12345678 (very long numeric), etc.
 * These leak through the "stop words" check because they have ≥ 3 chars
 * and aren't purely numeric, yet they are common to every card payment of
 * a given user — which destroys merchant grouping when used as a keyword.
 */
function isCardMaskOrRef(token: string): boolean {
  // Single letter followed by digits: "X5327", "x1234", "N12345"
  if (/^[A-Za-z]\d{3,}$/.test(token)) return true;
  // Multiple X's possibly followed by digits: "XXXX", "XXXX1234"
  if (/^[Xx*]{2,}\d*$/.test(token)) return true;
  // Long numeric (already filtered by /^\d+$/ but keep for safety)
  if (/^\d{6,}$/.test(token)) return true;
  // High digit density: ≥ 50 % digits in a token ≥ 4 chars (covers
  // bank reference numbers like "REF12345AB", "TX87654321X")
  if (token.length >= 4) {
    const digits = (token.match(/\d/g) ?? []).length;
    if (digits / token.length >= 0.5) return true;
  }
  return false;
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
    if (/^\d+$/.test(cleaned)) continue;          // pure numbers
    if (isCardMaskOrRef(cleaned)) continue;       // X5327, XXXX1234, REF12345…

    const norm = normalizeForStopCheck(cleaned);
    if (STOP_WORDS.has(norm)) continue;

    // Return the cleaned word preserving original casing/accents
    // so it works correctly in a Postgres ILIKE query
    return cleaned;
  }

  return null;
}
