"use server";

import { revalidatePath } from "next/cache";
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

/**
 * Re-scan from scratch: deletes all active (non-dismissed) subscriptions and
 * lets the next /subscriptions render re-detect them with the current
 * detection rules. Dismissed subs (active=false) are preserved so users don't
 * have to re-dismiss the same false positives every time they rescan.
 */
export async function rescanSubscriptions() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("subscriptions")
    .delete()
    .eq("user_id", user.id)
    .eq("active", true);

  revalidatePath("/subscriptions");
}
