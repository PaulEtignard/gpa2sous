"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildSeedRules, findMatchingCategoryId } from "@/lib/categorize";

const KINDS = ["income", "expense", "transfer"] as const;
type Kind = (typeof KINDS)[number];

function readKind(formData: FormData): Kind {
  const k = String(formData.get("kind") ?? "expense");
  if (!KINDS.includes(k as Kind)) throw new Error("Type de catégorie invalide.");
  return k as Kind;
}

export async function createCategory(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#94a3b8");
  if (!name) throw new Error("Nom requis.");
  const kind = readKind(formData);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { error } = await supabase.from("categories").insert({
    user_id: user.id,
    name,
    kind,
    color,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/categories");
}

export async function updateCategory(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#94a3b8");
  if (!id || !name) throw new Error("Identifiant et nom requis.");
  const kind = readKind(formData);

  const supabase = await createClient();
  const { error } = await supabase
    .from("categories")
    .update({ name, color, kind })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
}

export async function deleteCategory(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/budgets");
  revalidatePath("/dashboard");
}

/**
 * Defensive helper: if the auth.users → categories seed trigger didn't run
 * (e.g. user signed up before schema.sql was applied), this re-creates the
 * default 15 categories on demand.
 */
export async function seedDefaultCategories(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const defaults: { name: string; color: string; kind: Kind }[] = [
    { name: "Salaire", color: "#16a34a", kind: "income" },
    { name: "Autres revenus", color: "#22c55e", kind: "income" },
    { name: "Alimentation", color: "#f59e0b", kind: "expense" },
    { name: "Restaurants & bars", color: "#f97316", kind: "expense" },
    { name: "Transports", color: "#3b82f6", kind: "expense" },
    { name: "Logement", color: "#8b5cf6", kind: "expense" },
    { name: "Factures & abos", color: "#a855f7", kind: "expense" },
    { name: "Santé", color: "#ec4899", kind: "expense" },
    { name: "Shopping", color: "#ef4444", kind: "expense" },
    { name: "Loisirs", color: "#14b8a6", kind: "expense" },
    { name: "Voyages", color: "#06b6d4", kind: "expense" },
    { name: "Cadeaux & dons", color: "#84cc16", kind: "expense" },
    { name: "Retraits", color: "#64748b", kind: "expense" },
    { name: "Virements internes", color: "#94a3b8", kind: "transfer" },
    { name: "Autres dépenses", color: "#6b7280", kind: "expense" },
  ];

  const { error } = await supabase
    .from("categories")
    .upsert(
      defaults.map((d) => ({ ...d, user_id: user.id })),
      { onConflict: "user_id,name", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);

  revalidatePath("/categories");
}

/** Typed version of addRule — callable directly from client components. */
export async function addRuleDirect(pattern: string, categoryId: string): Promise<void> {
  const trimmed = pattern.trim();
  if (!trimmed || !categoryId) throw new Error("Pattern et catégorie requis.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { error } = await supabase.from("rules").insert({
    user_id: user.id,
    pattern: trimmed,
    category_id: categoryId,
    priority: 50,
  });
  if (error) throw new Error(error.message);

  // Retroactively apply to uncategorized transactions
  await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .ilike("description", `%${trimmed}%`)
    .is("category_id", null)
    .eq("user_id", user.id);

  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}

export async function addRule(formData: FormData): Promise<void> {
  const pattern = String(formData.get("pattern") ?? "").trim();
  const categoryId = String(formData.get("category_id"));
  if (!pattern || !categoryId) throw new Error("Pattern et catégorie requis.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { error } = await supabase.from("rules").insert({
    user_id: user.id,
    pattern,
    category_id: categoryId,
    priority: 50,
  });
  if (error) throw new Error(error.message);

  // Apply the new rule retroactively to existing uncategorized transactions.
  // ilike is case-insensitive; bank descriptions are typically ASCII-only so
  // diacritics are rarely an issue. We only touch rows with no category yet.
  await supabase
    .from("transactions")
    .update({ category_id: categoryId })
    .ilike("description", `%${pattern}%`)
    .is("category_id", null)
    .eq("user_id", user.id);

  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}

export async function deleteRule(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("rules").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/categories");
}

export async function seedDefaultRules(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .eq("user_id", user.id);
  if (!categories) throw new Error("Catégories introuvables.");

  const catMap = new Map(categories.map((c) => [c.name, c.id]));
  const rules = buildSeedRules(catMap).map((r) => ({ ...r, user_id: user.id }));

  if (rules.length === 0) return;
  const { error } = await supabase.from("rules").insert(rules);
  if (error) throw new Error(error.message);

  // Apply all seeded rules retroactively to existing uncategorized transactions.
  // Load them once, then do one UPDATE per matched category (batched).
  const { data: txs } = await supabase
    .from("transactions")
    .select("id, description")
    .eq("user_id", user.id)
    .is("category_id", null);

  if (txs && txs.length > 0) {
    // Group matched transaction ids by target category
    const byCategory = new Map<string, string[]>();
    for (const tx of txs) {
      const catId = findMatchingCategoryId(tx.description, rules);
      if (!catId) continue;
      const arr = byCategory.get(catId) ?? [];
      arr.push(tx.id);
      byCategory.set(catId, arr);
    }
    // One UPDATE per category (uses an IN clause — efficient)
    for (const [catId, ids] of byCategory.entries()) {
      await supabase
        .from("transactions")
        .update({ category_id: catId })
        .in("id", ids)
        .eq("user_id", user.id);
    }
  }

  revalidatePath("/categories");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}
