import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { detectSubscriptions } from "@/lib/subscriptions/detect";
import { enrichSubscriptions } from "@/lib/ai/enrich-subscriptions";
import { extractMerchantKeyword } from "@/lib/merchant";
import {
  lookupMerchantsForExamples,
  normalizeMerchantKey,
  recordMerchant,
} from "@/lib/merchants/lookup";
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

  // ── Prune orphaned subscriptions ────────────────────────────────────────────
  // A subscription whose backing transactions no longer exist (e.g. the account
  // was deleted — transactions cascade-delete with it) must disappear. We build
  // the set of merchant keys still present in the current transactions (same
  // extraction the detector uses) and drop any ACTIVE subscription whose pattern
  // isn't among them. Dismissed subs are left untouched (the user's choice).
  // This is safe: any sub backed by real transactions keeps its key in the set,
  // so only truly orphaned rows are removed.
  const presentKeys = new Set<string>();
  for (const t of transactions) {
    const kw = extractMerchantKeyword(t.description);
    if (kw) presentKeys.add(normalizeMerchantKey(kw));
  }

  const orphanIds = allSubs
    .filter((s) => s.active && !presentKeys.has(s.description_pattern))
    .map((s) => s.id);

  if (orphanIds.length > 0) {
    await supabase.from("subscriptions").delete().in("id", orphanIds).eq("user_id", user.id);
    for (const id of orphanIds) {
      const idx = allSubs.findIndex((s) => s.id === id);
      if (idx >= 0) allSubs.splice(idx, 1);
    }
  }

  // ── Merchant enrichment ────────────────────────────────────────────────────
  // The known-merchant base is the source of truth and is consulted on EVERY
  // load (not only for un-named subs). This means:
  //   1. We always prefer the DB over an AI call (and over a stale snapshot).
  //   2. When an admin edits a merchant, the change propagates to every user's
  //      matching subscription on their next page load — no "Analyser" needed.
  // The AI is a fallback used only for descriptions the base can't resolve yet.
  {
    const userId = user.id;
    function applyEnrichment(
      id: string,
      e: { displayName: string; domain: string | null; logoUrl: string | null },
    ) {
      const sub = allSubs.find((s) => s.id === id);
      if (sub) {
        sub.display_name = e.displayName;
        sub.domain = e.domain;
        sub.logo_url = e.logoUrl;
      }
      return supabase
        .from("subscriptions")
        .update({ display_name: e.displayName, domain: e.domain, logo_url: e.logoUrl })
        .eq("id", id)
        .eq("user_id", userId);
    }

    // ── 1. DB-first — re-sync ALL subs against the known-merchant base ───────
    const hits = await lookupMerchantsForExamples(
      allSubs.map((s) => ({ id: s.id, example: s.example_description ?? s.description_pattern })),
    );

    await Promise.all(
      allSubs
        .filter((s) => {
          const h = hits.get(s.id);
          if (!h) return false;
          // Only write when the merchant data actually differs from the snapshot
          // (avoids a pointless UPDATE on every render).
          return (
            s.display_name !== h.displayName ||
            s.domain !== h.domain ||
            s.logo_url !== h.logoUrl
          );
        })
        .map((s) => {
          const h = hits.get(s.id)!;
          return applyEnrichment(s.id, {
            displayName: h.displayName,
            domain: h.domain,
            logoUrl: h.logoUrl,
          });
        }),
    );

    // ── 2. AI fallback — only subs with no DB match that still lack a name ────
    const needAI = allSubs.filter(
      (s) =>
        !hits.has(s.id) &&
        (!s.display_name ||
          (s.domain && !s.logo_url) ||
          s.display_name === s.example_description ||
          s.display_name === s.description_pattern),
    );

    if (needAI.length > 0) {
      const enriched = await enrichSubscriptions(
        needAI.map((s) => ({
          id: s.id,
          exampleDescription: s.example_description ?? s.description_pattern,
        })),
      );

      await Promise.all(enriched.map((e) => applyEnrichment(e.id, e)));

      // ── 3. Grow the knowledge base with newly identified merchants ─────────
      await Promise.all(
        enriched.map((e) => {
          if (!e.domain) return Promise.resolve(); // skip bank fees / transfers
          const sub = needAI.find((s) => s.id === e.id);
          if (!sub) return Promise.resolve();
          return recordMerchant({
            displayName: e.displayName,
            domain: e.domain,
            logoUrl: e.logoUrl,
            alias: sub.description_pattern,
          });
        }),
      );
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
