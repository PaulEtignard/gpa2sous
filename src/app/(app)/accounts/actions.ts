"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function createAccount(formData: FormData): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const bank = String(formData.get("bank") ?? "").trim() || null;
  const currency = String(formData.get("currency") ?? "EUR").trim();
  const initialBalance = Number(formData.get("initial_balance") ?? 0);

  if (!name) throw new Error("Le nom est requis.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { error } = await supabase.from("accounts").insert({
    user_id: user.id,
    name,
    bank,
    currency,
    initial_balance: initialBalance,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/accounts");
}

export async function deleteAccount(formData: FormData): Promise<void> {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const { error } = await supabase.from("accounts").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/accounts");
}

/**
 * Auto-detect inter-account transfer pairs and lock their categorization.
 *
 * Calls the Postgres function `pair_transfers(auth.uid())` which:
 *   - finds, for each unpaired negative-amount tx, an opposite positive-amount
 *     tx on a different account within ±3 days
 *   - assigns the same fresh transfer_id to both legs
 *   - sets their category to "Virements internes" (kind=transfer) unless the
 *     row was already manually categorized
 *
 * Returns the number of pairs created. KPIs (dashboard + transactions stats)
 * automatically exclude any tx with transfer_id set, so the numbers stop
 * being inflated by transfers as soon as this runs.
 */
export async function detectTransfers(): Promise<{ pairs: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { data, error } = await supabase.rpc("pair_transfers", { p_user_id: user.id });
  if (error) throw new Error(error.message);

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");

  return { pairs: Number(data ?? 0) };
}

/**
 * Unlink a pair of transfer transactions (UI escape hatch when the auto
 * detection paired the wrong rows). Resets both legs to non-paired and
 * clears the rule-driven categorization only for those rows.
 */
export async function unlinkTransfer(transferId: string): Promise<void> {
  if (!transferId) throw new Error("transferId requis.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  const { error } = await supabase
    .from("transactions")
    .update({
      transfer_id: null,
      category_id: null,
      categorization_source: null,
    })
    .eq("user_id", user.id)
    .eq("transfer_id", transferId)
    .eq("manual_category", false);

  if (error) throw new Error(error.message);

  revalidatePath("/accounts");
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/budgets");
}
