import { createClient } from "@/lib/supabase/server";
import { categorizeBatchCompact, COMPACT_BATCH_SIZE } from "@/lib/ai/categorize";
import { revalidatePath } from "next/cache";

// Give Vercel Pro / self-hosted enough time for large batches
export const maxDuration = 120;

export async function POST(request: Request) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Non authentifié" }, { status: 401 });
  const userId = user.id;

  // Verify the job exists and belongs to this user
  let jobId: string;
  try {
    const body = await request.json();
    jobId = String(body.jobId ?? "");
  } catch {
    return Response.json({ error: "Corps invalide" }, { status: 400 });
  }

  const { data: job } = await supabase
    .from("jobs")
    .select("id, status")
    .eq("id", jobId)
    .eq("user_id", userId)
    .single();

  if (!job) return Response.json({ error: "Job introuvable" }, { status: 404 });

  // Idempotent: if already running/done, just return OK
  if (job.status === "running" || job.status === "done") {
    return Response.json({ ok: true });
  }

  // Mark as running
  await supabase
    .from("jobs")
    .update({ status: "running", updated_at: new Date().toISOString() })
    .eq("id", jobId);

  try {
    // Fetch all uncategorized transactions + categories in one round-trip
    const [{ data: txRows }, { data: catRows }] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, description, amount, booked_at")
        .eq("user_id", userId)
        .is("category_id", null)
        .eq("manual_category", false)
        .order("booked_at", { ascending: false }),
      supabase
        .from("categories")
        .select("id, name, kind")
        .eq("user_id", userId)
        .order("name"),
    ]);

    const transactions = (txRows ?? []).map((t) => ({
      id: t.id,
      description: t.description,
      amount: Number(t.amount),
      booked_at: t.booked_at,
    }));
    const categories = (catRows ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      kind: c.kind as "income" | "expense" | "transfer",
    }));

    // Split into batches
    const batches: typeof transactions[] = [];
    for (let i = 0; i < transactions.length; i += COMPACT_BATCH_SIZE) {
      batches.push(transactions.slice(i, i + COMPACT_BATCH_SIZE));
    }

    let totalCategorized = 0;
    const errors: string[] = [];

    // Process batches with limited concurrency (5 at a time)
    const CONCURRENCY = 5;
    let next = 0;

    async function worker() {
      while (next < batches.length) {
        const batch = batches[next++];
        try {
          const results = await categorizeBatchCompact(
            batch.map((t) => ({
              id: t.id,
              description: t.description,
              amount: t.amount,
              date: t.booked_at,
            })),
            categories,
          );

          // Group by category → one UPDATE per category per batch
          const byCategory = new Map<string, string[]>();
          for (const r of results) {
            if (!r.categoryId) continue;
            const arr = byCategory.get(r.categoryId) ?? [];
            arr.push(r.transactionId);
            byCategory.set(r.categoryId, arr);
          }

          for (const [catId, ids] of byCategory.entries()) {
            const { error } = await supabase
              .from("transactions")
              .update({ category_id: catId, categorization_source: "ai" })
              .in("id", ids)
              .eq("user_id", userId)
              .eq("manual_category", false);
            if (error) errors.push(error.message);
            else totalCategorized += ids.length;
          }
        } catch (e) {
          errors.push(e instanceof Error ? e.message : String(e));
        }
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, batches.length || 1) }, worker),
    );

    // Mark done
    await supabase
      .from("jobs")
      .update({
        status: "done",
        result: { scanned: transactions.length, categorized: totalCategorized, errors },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);

    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    revalidatePath("/budgets");

    return Response.json({ ok: true, categorized: totalCategorized, scanned: transactions.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await supabase
      .from("jobs")
      .update({
        status: "error",
        result: { error: msg },
        updated_at: new Date().toISOString(),
      })
      .eq("id", jobId);
    return Response.json({ error: msg }, { status: 500 });
  }
}
