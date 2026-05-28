import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { detectSubscriptions } from "@/lib/subscriptions/detect";
import { enrichSubscriptions } from "@/lib/ai/enrich-subscriptions";
import { SubscriptionsView } from "./subscriptions-view";

export default async function SubscriptionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Fetch last 15 months of debits (enough to detect annual subs)
  const since = new Date();
  since.setMonth(since.getMonth() - 15);

  const { data: txRows } = await supabase
    .from("transactions")
    .select("booked_at, description, amount, currency")
    .eq("user_id", user.id)
    .gte("booked_at", since.toISOString().slice(0, 10))
    .lt("amount", 0)
    .order("booked_at", { ascending: false });

  const transactions = (txRows ?? []).map((t) => ({
    booked_at: t.booked_at,
    description: t.description,
    amount: Number(t.amount),
    currency: t.currency,
  }));

  // ── Detect & sync ──────────────────────────────────────────────────────────
  const detected = detectSubscriptions(transactions);

  if (detected.length > 0) {
    await supabase.from("subscriptions").upsert(
      detected.map((d) => ({
        user_id: user.id,
        description_pattern: d.descriptionPattern,
        example_description: d.exampleDescription,
        period_days: d.periodDays,
        avg_amount: d.avgAmount,
        currency: d.currency,
        last_charged_at: d.lastChargedAt,
        next_expected_at: d.nextExpectedAt,
        occurrence_count: d.occurrenceCount,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "user_id,description_pattern" },
    );
  }

  // ── Load all subscriptions ─────────────────────────────────────────────────
  const { data: rows } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("user_id", user.id)
    .order("avg_amount", { ascending: false });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSubs: any[] = rows ?? [];

  // ── AI enrichment — only for subs missing display_name or logo ────────────
  const toEnrich = allSubs.filter(
    (s) =>
      !s.display_name ||
      (s.domain && !s.logo_url) ||
      s.display_name === s.example_description ||
      s.display_name === s.description_pattern,
  );
  if (toEnrich.length > 0) {
    const enriched = await enrichSubscriptions(
      toEnrich.map((s) => ({
        id: s.id,
        exampleDescription: s.example_description ?? s.description_pattern,
      })),
    );

    await Promise.all(
      enriched.map((e) =>
        supabase
          .from("subscriptions")
          .update({ display_name: e.displayName, domain: e.domain, logo_url: e.logoUrl })
          .eq("id", e.id)
          .eq("user_id", user.id),
      ),
    );

    for (const e of enriched) {
      const sub = allSubs.find((s) => s.id === e.id);
      if (sub) {
        sub.display_name = e.displayName;
        sub.domain = e.domain;
        sub.logo_url = e.logoUrl;
      }
    }
  }

  // ── Split active / dismissed ───────────────────────────────────────────────
  const twoMonthsAgo = new Date();
  twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

  function isRecentEnough(sub: { active: boolean; next_expected_at: string | null; last_charged_at: string | null }) {
    if (!sub.active) return false;
    if (sub.next_expected_at) return new Date(sub.next_expected_at) >= twoMonthsAgo;
    if (sub.last_charged_at) return new Date(sub.last_charged_at) >= twoMonthsAgo;
    return true;
  }

  const activeSubs = allSubs.filter(isRecentEnough);
  const dismissedSubs = allSubs.filter((s) => !s.active);

  const monthlyEquiv = activeSubs.reduce((sum, s) => {
    const amt = Number(s.avg_amount);
    if (s.period_days >= 360) return sum + amt / 12;
    if (s.period_days <= 10) return sum + (amt * 52) / 12;
    return sum + amt;
  }, 0);

  return (
    <SubscriptionsView
      activeSubs={activeSubs}
      dismissedSubs={dismissedSubs}
      monthlyEquiv={monthlyEquiv}
    />
  );
}
