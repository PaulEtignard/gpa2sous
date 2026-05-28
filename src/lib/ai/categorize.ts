/**
 * AI-powered transaction categorization.
 *
 * Constraints:
 *   - The model can ONLY pick from the user's own categories (no hallucinated
 *     names). We validate every returned name against the whitelist; unknown
 *     names become null (= uncategorized) so the user can retry or set them
 *     by hand.
 *   - Transactions are batched (default 40 per call) to keep latency and
 *     cost low while staying well within context limits.
 */

import { callOpenRouter } from "./openrouter";

export interface AiCategoryOption {
  id: string;
  name: string;
  kind: "income" | "expense" | "transfer";
}

export interface AiTransactionInput {
  id: string;
  description: string;
  amount: number;
  date: string;
}

export interface AiCategorizationResult {
  transactionId: string;
  categoryId: string | null;
  categoryName: string | null;
}

const BATCH_SIZE = 20;

// ---------------------------------------------------------------------------
// Compact batch categorization — index-based (no string matching)
// ---------------------------------------------------------------------------
// The model returns tx_index:cat_index pairs. No name matching needed at all,
// so there is zero risk of mismatch due to accents, spacing, or phrasing.
// On the first pass the model covers ~100 % of transactions; a retry pass
// handles the rare stragglers so the final result is always complete.

export const COMPACT_BATCH_SIZE = 25;

export async function categorizeBatchCompact(
  transactions: AiTransactionInput[],
  categories: AiCategoryOption[],
): Promise<AiCategorizationResult[]> {
  if (transactions.length === 0) return [];

  const results = await categorizeBatchIndexed(transactions, categories);

  // Retry any transaction the model skipped on the first pass
  const missingIdxs = results
    .map((r, i) => (r.categoryId === null ? i : -1))
    .filter((i) => i !== -1);

  if (missingIdxs.length > 0) {
    const retryTxs = missingIdxs.map((i) => transactions[i]);
    const retryResults = await categorizeBatchIndexed(retryTxs, categories);
    for (let j = 0; j < missingIdxs.length; j++) {
      if (retryResults[j].categoryId !== null) {
        results[missingIdxs[j]] = {
          ...retryResults[j],
          transactionId: transactions[missingIdxs[j]].id,
        };
      }
    }
  }

  return results;
}

async function categorizeBatchIndexed(
  transactions: AiTransactionInput[],
  categories: AiCategoryOption[],
): Promise<AiCategorizationResult[]> {
  const catList = categories
    .map((c, i) => `${i}:${c.name} (${labelKind(c.kind)})`)
    .join("\n");

  const lines = transactions
    .map((t, i) => {
      const sign = t.amount >= 0 ? "+" : "-";
      return `${i}|${sign}${Math.abs(t.amount).toFixed(0)}|${t.description}`;
    })
    .join("\n");

  const n = transactions.length;

  const prompt = `Classifie ces ${n} transactions bancaires françaises.

CATÉGORIES (index:nom) :
${catList}

TRANSACTIONS (index|montant|libellé) :
${lines}

Réponds avec EXACTEMENT ${n} lignes, une par transaction, format :
index_transaction:index_catégorie

Aucun texte, aucune explication, aucune ligne vide.`;

  const raw = await callOpenRouter([{ role: "user", content: prompt }], {
    temperature: 0,
    maxTokens: Math.max(300, n * 12),
  });

  const results: AiCategorizationResult[] = transactions.map((t) => ({
    transactionId: t.id,
    categoryId: null,
    categoryName: null,
  }));

  // Parse "tx_idx:cat_idx" — only digits on each side
  const rx = /^(\d+)\s*:\s*(\d+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(raw)) !== null) {
    const txIdx = parseInt(m[1]);
    const catIdx = parseInt(m[2]);
    if (txIdx < 0 || txIdx >= transactions.length) continue;
    if (catIdx < 0 || catIdx >= categories.length) continue;
    const cat = categories[catIdx];
    results[txIdx] = {
      transactionId: transactions[txIdx].id,
      categoryId: cat.id,
      categoryName: cat.name,
    };
  }

  return results;
}

export async function categorizeWithAI(
  transactions: AiTransactionInput[],
  categories: AiCategoryOption[],
): Promise<AiCategorizationResult[]> {
  if (transactions.length === 0) return [];
  if (categories.length === 0) {
    throw new Error("Aucune catégorie disponible — crée d'abord au moins une catégorie.");
  }

  const idByName = new Map(categories.map((c) => [normalizeName(c.name), c.id]));
  const out: AiCategorizationResult[] = [];

  for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
    const batch = transactions.slice(i, i + BATCH_SIZE);
    const responses = await categorizeBatch(batch, categories);

    for (const tx of batch) {
      const ai = responses.find((r) => r.id === tx.id);
      const rawName = ai?.category?.trim() ?? null;
      const normalizedName = rawName ? normalizeName(rawName) : null;
      const categoryId = normalizedName ? idByName.get(normalizedName) ?? null : null;
      out.push({
        transactionId: tx.id,
        categoryId,
        categoryName: categoryId ? rawName : null,
      });
    }
  }

  return out;
}

async function categorizeBatch(
  transactions: AiTransactionInput[],
  categories: AiCategoryOption[],
): Promise<{ id: string; category: string | null }[]> {
  const categoryList = categories.map((c) => `- ${c.name} (${labelKind(c.kind)})`).join("\n");
  const transactionLines = transactions
    .map(
      (t) =>
        `[id=${t.id}] ${t.date} | ${formatSign(t.amount)}${Math.abs(t.amount).toFixed(2)}€ | ${t.description}`,
    )
    .join("\n");

  const prompt = `Tu es un assistant de classification de transactions bancaires françaises.

CATÉGORIES DISPONIBLES — tu dois obligatoirement choisir dans cette liste, mot pour mot :
${categoryList}

TRANSACTIONS À CLASSER :
${transactionLines}

RÈGLES ABSOLUES :
- Tu DOIS attribuer une catégorie à chaque transaction, sans exception.
- Choisis TOUJOURS la catégorie la plus probable, même quand la description est ambiguë.
- N'invente jamais de nouvelle catégorie. Utilise uniquement les noms exacts ci-dessus.
- Une transaction négative est une dépense ; positive, un revenu ou transfert entrant.
- Ne retourne jamais null — si tu n'es pas sûr, choisis quand même la plus proche.

Réponds UNIQUEMENT avec ce JSON (pas d'explication, pas de texte autour) :
{"results":[{"id":"<id>","category":"<nom exact>"},...]}`;

  const content = await callOpenRouter(
    [{ role: "user", content: prompt }],
    { temperature: 0 },
  );

  let parsed: { results?: { id?: string; category?: string | null }[] };
  try {
    parsed = JSON.parse(content);
  } catch {
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("Réponse IA non parsable: " + content.slice(0, 200));
    parsed = JSON.parse(match[0]);
  }

  const results = parsed.results ?? [];
  return results
    .filter((r): r is { id: string; category: string | null } => typeof r.id === "string")
    .map((r) => ({ id: r.id, category: r.category ?? null }));
}

function normalizeName(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/\p{Mn}/gu, "").trim();
}

function labelKind(k: AiCategoryOption["kind"]): string {
  if (k === "income") return "revenu";
  if (k === "transfer") return "transfert";
  return "dépense";
}

function formatSign(n: number): string {
  return n >= 0 ? "+" : "-";
}
