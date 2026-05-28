"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/admin";
import { normalizeMerchantKey } from "@/lib/merchants/lookup";

export async function createMerchant(formData: FormData) {
  const { supabase } = await requireAdmin();

  const displayName = String(formData.get("display_name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase() || null;
  const logoUrl = String(formData.get("logo_url") ?? "").trim() || null;
  const aliasRaw = String(formData.get("alias") ?? "").trim();
  if (!displayName) return;

  const { data: created } = await supabase
    .from("merchants")
    .insert({ display_name: displayName, domain, logo_url: logoUrl, source: "manual" })
    .select("id")
    .single();

  const alias = normalizeMerchantKey(aliasRaw);
  if (created?.id && alias.length >= 3) {
    await supabase.from("merchant_aliases").insert({ merchant_id: created.id, pattern: alias });
  }

  revalidatePath("/admin/merchants");
}

export async function updateMerchant(formData: FormData) {
  const { supabase } = await requireAdmin();

  const id = String(formData.get("id") ?? "");
  const displayName = String(formData.get("display_name") ?? "").trim();
  const domain = String(formData.get("domain") ?? "").trim().toLowerCase() || null;
  const logoUrl = String(formData.get("logo_url") ?? "").trim() || null;
  if (!id || !displayName) return;

  await supabase
    .from("merchants")
    .update({ display_name: displayName, domain, logo_url: logoUrl, updated_at: new Date().toISOString() })
    .eq("id", id);

  revalidatePath("/admin/merchants");
}

export async function deleteMerchant(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase.from("merchants").delete().eq("id", id);
  revalidatePath("/admin/merchants");
}

export async function addAlias(formData: FormData) {
  const { supabase } = await requireAdmin();
  const merchantId = String(formData.get("merchant_id") ?? "");
  const alias = normalizeMerchantKey(String(formData.get("alias") ?? ""));
  if (!merchantId || alias.length < 3) return;
  await supabase.from("merchant_aliases").insert({ merchant_id: merchantId, pattern: alias });
  revalidatePath("/admin/merchants");
}

export async function deleteAlias(formData: FormData) {
  const { supabase } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  await supabase.from("merchant_aliases").delete().eq("id", id);
  revalidatePath("/admin/merchants");
}

export async function setUserRole(formData: FormData) {
  const { supabase, user } = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!id || (role !== "user" && role !== "admin")) return;
  // Guard against an admin locking themselves out by self-demoting.
  if (id === user.id && role !== "admin") return;
  await supabase.from("profiles").update({ role }).eq("id", id);
  revalidatePath("/admin/users");
}
