"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function dismissSubscription(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("subscriptions")
    .update({ active: false })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/subscriptions");
}

export async function restoreSubscription(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("subscriptions")
    .update({ active: true })
    .eq("id", id)
    .eq("user_id", user.id);
  revalidatePath("/subscriptions");
}

/** Re-scan: wipe all enrichment data so the next page load re-detects and re-enriches. */
export async function rescanSubscriptions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // Clear all enrichment so the page re-runs detection + AI logo resolution
  await supabase
    .from("subscriptions")
    .update({ display_name: null, domain: null, logo_url: null })
    .eq("user_id", user.id);

  redirect("/subscriptions");
}
