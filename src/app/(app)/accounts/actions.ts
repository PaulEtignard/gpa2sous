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
