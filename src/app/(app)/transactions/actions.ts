"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { categorizeWithAI, categorizeBatchCompact, COMPACT_BATCH_SIZE } from "@/lib/ai/categorize";
import { callOpenRouter } from "@/lib/ai/openrouter";
import { extractMerchantKeyword } from "@/lib/merchant";

export async function updateTransactionCategory(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const rawCategoryId = String(formData.get("category_id") ?? "");
  const categoryId = rawCategoryId.length > 0 ? rawCategoryId : null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

/** Direct (non-form) version used by CategorySelect. */
export async function setCategoryDirect(id: string, categoryId: string | null): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) throw new Error(error.message);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

/**
 * Find how many other transactions share the same merchant keyword and are not
 * already in `categoryId`. Returns the keyword used and the count so the UI
 * can offer a bulk-categorize action.
 */
export async function findSimilarMerchants(
  excludeId: string,
  description: string,
  categoryId: string,
): Promise<{ keyword: string; count: number }> {
  const keyword = extractMerchantKeyword(description);
  if (!keyword) return { keyword: "", count: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { keyword, count: 0 };

  const { count } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .ilike("description", `%${keyword}%`)
    .neq("id", excludeId)
    .or(`category_id.neq.${categoryId},category_id.is.null`);

  return { keyword, count: count ?? 0 };
}

/**
 * Bulk-categorize all transactions whose description contains `keyword` and
 * that are not already in `categoryId`.
 */
export async function bulkCategorizeByMerchant(
  keyword: string,
  categoryId: string,
): Promise<{ updated: number }> {
  if (!keyword) return { updated: 0 };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { error } = await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .eq("user_id", user.id)
    .ilike("description", `%${keyword}%`)
    .or(`category_id.neq.${categoryId},category_id.is.null`);

  if (error) throw new Error(error.message);

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
  return { updated: 0 };
}

export async function deleteTransaction(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("transactions").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}

/**
 * AI-categorize all uncategorized transactions for the current user.
 *
 * Constraints (per the user's request):
 *   - Only categories the user actually owns are valid outputs
 *   - We update in batches to keep the round-trip count low
 *   - If the OpenRouter call fails partway, we keep the rows that succeeded
 */
export async function aiCategorizeUncategorized(): Promise<{
  scanned: number;
  categorized: number;
  skipped: number;
  errors: string[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const [{ data: cats, error: catsErr }, { data: txs, error: txsErr }] = await Promise.all([
    supabase.from("categories").select("id, name, kind").eq("user_id", user.id),
    supabase
      .from("transactions")
      .select("id, description, amount, booked_at")
      .eq("user_id", user.id)
      .is("category_id", null)
      .order("booked_at", { ascending: false })
      .limit(500),
  ]);

  if (catsErr) throw new Error(catsErr.message);
  if (txsErr) throw new Error(txsErr.message);

  if (!cats || cats.length === 0) {
    throw new Error("Aucune catégorie. Crée au moins une catégorie avant d'utiliser l'IA.");
  }

  if (!txs || txs.length === 0) {
    return { scanned: 0, categorized: 0, skipped: 0, errors: [] };
  }

  const errors: string[] = [];
  let results;
  try {
    results = await categorizeWithAI(
      txs.map((t) => ({
        id: t.id,
        description: t.description,
        amount: Number(t.amount),
        date: t.booked_at,
      })),
      cats.map((c) => ({ id: c.id, name: c.name, kind: c.kind })),
    );
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { scanned: txs.length, categorized: 0, skipped: txs.length, errors };
  }

  let categorized = 0;
  let skipped = 0;

  // Group by category for batched updates
  const byCategory = new Map<string, string[]>();
  for (const r of results) {
    if (!r.categoryId) {
      skipped++;
      continue;
    }
    const arr = byCategory.get(r.categoryId) ?? [];
    arr.push(r.transactionId);
    byCategory.set(r.categoryId, arr);
  }

  for (const [categoryId, ids] of byCategory.entries()) {
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: categoryId })
      .in("id", ids);
    if (error) {
      errors.push(error.message);
      skipped += ids.length;
    } else {
      categorized += ids.length;
    }
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
  return { scanned: txs.length, categorized, skipped, errors };
}

// ---------------------------------------------------------------------------
// One-by-one categorization (called per transaction from the client progress loop)
// ---------------------------------------------------------------------------

export async function getUncategorizedTransactions(): Promise<{
  transactions: { id: string; description: string; amount: number; booked_at: string }[];
  categories: { id: string; name: string; kind: string }[];
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const [{ data: txs, error: txErr }, { data: cats, error: catErr }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, description, amount, booked_at")
      .eq("user_id", user.id)
      .is("category_id", null)
      .order("booked_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, kind")
      .eq("user_id", user.id)
      .order("name"),
  ]);

  if (txErr) throw new Error(txErr.message);
  if (catErr) throw new Error(catErr.message);

  return {
    transactions: (txs ?? []).map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      booked_at: t.booked_at,
    })),
    categories: (cats ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind as "income" | "expense" | "transfer",
    })),
  };
}

export async function aiCategorizeSingleTransaction(
  txId: string,
  description: string,
  amount: number,
  date: string,
  categories: { id: string; name: string; kind: string }[],
): Promise<{ categoryId: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const categoryList = categories
    .map((c) => `- ${c.name}`)
    .join("\n");

  const sign = amount < 0 ? "-" : "+";
  const prompt = `Classe cette transaction bancaire française dans la catégorie la plus adaptée.

CATÉGORIES DISPONIBLES (réponds avec le nom EXACT, sans rien d'autre) :
${categoryList}

TRANSACTION :
${date} | ${sign}${Math.abs(amount).toFixed(2)}€ | ${description}

Réponds avec uniquement le nom exact de la catégorie, rien d'autre.`;

  const raw = await callOpenRouter([{ role: "user", content: prompt }], { temperature: 0 });

  // Normalize and match
  const normalize = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

  const answer = normalize(raw.trim().replace(/^["'`]|["'`]$/g, ""));
  const matched = categories.find((c) => normalize(c.name) === answer);

  // Fuzzy fallback: the model sometimes wraps the name in a sentence
  const fuzzyMatch =
    matched ??
    categories.find((c) => answer.includes(normalize(c.name))) ??
    categories.find((c) => normalize(c.name).split(" ").some((w) => w.length > 3 && answer.includes(w)));

  const categoryId = fuzzyMatch?.id ?? null;

  if (categoryId) {
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: categoryId })
      .eq("id", txId)
      .eq("user_id", user.id);
    if (error) throw new Error(error.message);
  }

  return { categoryId };
}

// ---------------------------------------------------------------------------
// Fast batch action — called by the client concurrency loop
// ---------------------------------------------------------------------------

export async function aiCategorizeBatchAndSave(
  txs: { id: string; description: string; amount: number; booked_at: string }[],
  categories: { id: string; name: string; kind: string }[],
): Promise<{ categorized: number; errors: string[] }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const errors: string[] = [];
  let results;
  try {
    results = await categorizeBatchCompact(
      txs.map((t) => ({ id: t.id, description: t.description, amount: t.amount, date: t.booked_at })),
      categories.map((c) => ({ id: c.id, name: c.name, kind: c.kind as "income" | "expense" | "transfer" })),
    );
  } catch (e) {
    errors.push(e instanceof Error ? e.message : String(e));
    return { categorized: 0, errors };
  }

  // Group by category for a single UPDATE per category
  const byCategory = new Map<string, string[]>();
  for (const r of results) {
    if (!r.categoryId) continue;
    const arr = byCategory.get(r.categoryId) ?? [];
    arr.push(r.transactionId);
    byCategory.set(r.categoryId, arr);
  }

  let categorized = 0;
  for (const [catId, ids] of byCategory.entries()) {
    const { error } = await supabase
      .from("transactions")
      .update({ category_id: catId })
      .in("id", ids)
      .eq("user_id", user.id);
    if (error) {
      errors.push(error.message);
    } else {
      categorized += ids.length;
    }
  }

  return { categorized, errors };
}

// ---------------------------------------------------------------------------
// Background job — fire and forget via after()
// ---------------------------------------------------------------------------
// Background job — create the record only; the Route Handler /api/jobs/run
// does the actual AI work (works in both next dev and next start).
// ---------------------------------------------------------------------------

export async function startCategorizationJob(): Promise<{ jobId: string; alreadyRunning: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  // Guard: return the existing job if one is already active for this user
  const { data: existing } = await supabase
    .from("jobs")
    .select("id")
    .eq("user_id", user.id)
    .eq("type", "ai_categorize")
    .in("status", ["pending", "running"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    return { jobId: existing.id as string, alreadyRunning: true };
  }

  const { data: job, error: jobErr } = await supabase
    .from("jobs")
    .insert({ user_id: user.id, type: "ai_categorize", status: "pending" })
    .select("id")
    .single();
  if (jobErr || !job) throw new Error(jobErr?.message ?? "Impossible de créer le job.");

  return { jobId: job.id as string, alreadyRunning: false };
}

export async function getJobStatus(jobId: string): Promise<{
  status: "pending" | "running" | "done" | "error";
  result: { scanned?: number; categorized?: number; errors?: string[]; error?: string } | null;
} | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("jobs")
    .select("status, result")
    .eq("id", jobId)
    .single();
  if (!data) return null;
  return {
    status: data.status as "pending" | "running" | "done" | "error",
    result: data.result as { scanned?: number; categorized?: number; errors?: string[]; error?: string } | null,
  };
}
