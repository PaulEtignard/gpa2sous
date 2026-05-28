import { redirect } from "next/navigation";
import { RefreshCw, X } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn, formatCurrency } from "@/lib/utils";
import { detectSubscriptions } from "@/lib/subscriptions/detect";
import { enrichSubscriptions } from "@/lib/ai/enrich-subscriptions";
import { dismissSubscription, restoreSubscription, rescanSubscriptions } from "./actions";
import { SubscriptionLogo } from "@/components/subscriptions/subscription-logo";

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
    // Upsert detected subscriptions.
    // display_name / domain / logo_url intentionally omitted → existing enrichment is preserved.
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

  // ── AI enrichment — only for subs missing display_name (single batch) ──────
  const toEnrich = allSubs.filter((s) => !s.display_name);
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

  // ── Totals ─────────────────────────────────────────────────────────────────
  // Hide subscriptions whose next expected charge is more than 2 months overdue
  // (likely cancelled). Use next_expected_at so annual subs aren't incorrectly hidden.
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

  const now = new Date();

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Abonnements</h1>
          <p className="text-sm text-muted-foreground">
            {activeSubs.length} abonnement{activeSubs.length !== 1 ? "s" : ""} détecté
            {activeSubs.length !== 1 ? "s" : ""} automatiquement
          </p>
        </div>

        <form action={rescanSubscriptions}>
          <Button type="submit" variant="outline" size="sm" className="gap-2">
            <RefreshCw className="h-3.5 w-3.5" />
            Re-scanner
          </Button>
        </form>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────── */}
      {activeSubs.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <SummaryCard label="Coût mensuel estimé" value={formatCurrency(monthlyEquiv)} />
          <SummaryCard
            label="Abonnements mensuels"
            value={String(
              activeSubs.filter((s) => s.period_days > 10 && s.period_days < 360).length,
            )}
          />
          <SummaryCard
            label="Abonnements annuels"
            value={String(activeSubs.filter((s) => s.period_days >= 360).length)}
          />
        </div>
      )}

      {/* ── Subscription grid ───────────────────────────────────────────── */}
      {activeSubs.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-sm text-muted-foreground">
            Aucun abonnement détecté. Importe au moins 2 mois de transactions pour que l'analyse
            puisse s'effectuer.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {activeSubs.map((sub) => {
            const nextDate = sub.next_expected_at ? new Date(sub.next_expected_at) : null;
            const daysUntilNext = nextDate
              ? Math.ceil((nextDate.getTime() - now.getTime()) / 86_400_000)
              : null;
            const isOverdue = daysUntilNext !== null && daysUntilNext < 0;
            const isSoon =
              daysUntilNext !== null && daysUntilNext >= 0 && daysUntilNext <= 7;
            const periodLabel =
              sub.period_days >= 360
                ? "Annuel"
                : sub.period_days <= 10
                ? "Hebdomadaire"
                : "Mensuel";

            return (
              <Card key={sub.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <SubscriptionLogo
                      logoUrl={sub.logo_url}
                      name={sub.display_name ?? sub.description_pattern}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold leading-tight">
                        {sub.display_name ?? sub.description_pattern}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {periodLabel} · {sub.occurrence_count} prélèvement
                        {sub.occurrence_count !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <form action={dismissSubscription}>
                      <input type="hidden" name="id" value={sub.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-zinc-700 hover:text-foreground"
                        title="Ignorer"
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </form>
                  </div>

                  <div className="mt-4 flex items-end justify-between">
                    <div>
                      <p className="text-xl font-bold tabular-nums">
                        {formatCurrency(Number(sub.avg_amount))}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {sub.period_days >= 360
                          ? "/ an"
                          : sub.period_days <= 10
                          ? "/ semaine"
                          : "/ mois"}
                        {sub.period_days >= 360 && (
                          <span className="ml-1.5 text-zinc-700">
                            ≈ {formatCurrency(Number(sub.avg_amount) / 12)}/mois
                          </span>
                        )}
                      </p>
                    </div>

                    {daysUntilNext !== null && (
                      <div className="text-right">
                        <p
                          className={cn(
                            "text-xs font-medium",
                            isOverdue
                              ? "text-red-400"
                              : isSoon
                              ? "text-amber-400"
                              : "text-muted-foreground",
                          )}
                        >
                          {isOverdue
                            ? `Attendu il y a ${Math.abs(daysUntilNext)}j`
                            : daysUntilNext === 0
                            ? "Aujourd'hui"
                            : `Dans ${daysUntilNext}j`}
                        </p>
                        {nextDate && (
                          <p className="text-[10px] text-zinc-700">
                            {nextDate.toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "short",
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Dismissed ───────────────────────────────────────────────────── */}
      {dismissedSubs.length > 0 && (
        <details>
          <summary className="cursor-pointer select-none text-xs text-zinc-600 hover:text-zinc-400">
            {dismissedSubs.length} abonnement{dismissedSubs.length !== 1 ? "s" : ""} ignoré
            {dismissedSubs.length !== 1 ? "s" : ""}
          </summary>
          <div className="mt-2 space-y-1">
            {dismissedSubs.map((sub) => (
              <div
                key={sub.id}
                className="flex items-center justify-between rounded-lg border border-white/[0.04] px-3 py-2 text-sm text-zinc-600"
              >
                <span>{sub.display_name ?? sub.description_pattern}</span>
                <div className="flex items-center gap-3">
                  <span className="font-mono tabular-nums">
                    {formatCurrency(Number(sub.avg_amount))}
                  </span>
                  <form action={restoreSubscription}>
                    <input type="hidden" name="id" value={sub.id} />
                    <button
                      type="submit"
                      className="cursor-pointer text-[11px] text-zinc-600 underline hover:text-zinc-300"
                    >
                      Restaurer
                    </button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <p className="text-2xl font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
