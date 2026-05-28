"use client";

import { useTransition } from "react";
import { RefreshCw, Sparkles, X } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SubscriptionLogo } from "@/components/subscriptions/subscription-logo";
import { dismissSubscription, restoreSubscription, rescanSubscriptions } from "./actions";

type Sub = {
  id: string;
  description_pattern: string;
  example_description: string | null;
  display_name: string | null;
  domain: string | null;
  logo_url: string | null;
  avg_amount: number | string;
  period_days: number;
  occurrence_count: number;
  next_expected_at: string | null;
  last_charged_at: string | null;
  active: boolean;
};

function ScanningOverlay() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6">
      <div className="relative flex items-center justify-center">
        <span className="absolute h-24 w-24 animate-ping rounded-full bg-violet-500/20" />
        <span className="absolute h-16 w-16 animate-ping rounded-full bg-violet-500/30 [animation-delay:300ms]" />
        <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-violet-500/10 ring-1 ring-violet-500/30">
          <Sparkles className="h-7 w-7 text-violet-400" />
        </div>
      </div>

      <div className="text-center">
        <p className="text-lg font-semibold text-zinc-100">Analyse en cours</p>
        <p className="mt-1 text-sm text-zinc-500">
          L&apos;IA identifie vos abonnements récurrents…
        </p>
      </div>

      <div className="flex items-center gap-1.5">
        {[0, 150, 300].map((delay) => (
          <span
            key={delay}
            className="h-1.5 w-1.5 animate-bounce rounded-full bg-violet-400"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))}
      </div>
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

export function SubscriptionsView({
  activeSubs,
  dismissedSubs,
  monthlyEquiv,
}: {
  activeSubs: Sub[];
  dismissedSubs: Sub[];
  monthlyEquiv: number;
}) {
  const [isPending, startTransition] = useTransition();
  const now = new Date();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Abonnements</h1>
          <p className="text-sm text-muted-foreground">
            {activeSubs.length} abonnement{activeSubs.length !== 1 ? "s" : ""} détecté
            {activeSubs.length !== 1 ? "s" : ""} automatiquement
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={isPending}
          onClick={() => startTransition(() => rescanSubscriptions())}
        >
          <RefreshCw className={cn("h-3.5 w-3.5", isPending && "animate-spin")} />
          {isPending ? "Analyse en cours…" : "Re-scanner"}
        </Button>
      </div>

      {/* Scanning overlay replaces the rest of the content */}
      {isPending ? (
        <ScanningOverlay />
      ) : (
        <>
          {/* Summary cards */}
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

          {/* Subscription grid */}
          {activeSubs.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center text-sm text-muted-foreground">
                Aucun abonnement détecté. Importe au moins 2 mois de transactions pour que
                l&apos;analyse puisse s&apos;effectuer.
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

          {/* Dismissed */}
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
        </>
      )}
    </div>
  );
}
