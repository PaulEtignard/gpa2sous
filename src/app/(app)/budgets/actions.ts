"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function setBudget(formData: FormData): Promise<void> {
  const categoryId = String(formData.get("category_id"));
  const monthlyAmount = Number(formData.get("monthly_amount") ?? 0);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Non authentifié.");

  if (monthlyAmount <= 0) {
    await supabase.from("budgets").delete().match({ user_id: user.id, category_id: categoryId });
  } else {
    const { error } = await supabase
      .from("budgets")
      .upsert(
        { user_id: user.id, category_id: categoryId, monthly_amount: monthlyAmount },
        { onConflict: "user_id,category_id" },
      );
    if (error) throw new Error(error.message);
  }

  revalidatePath("/budgets");
}
