import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  FileUp,
  PiggyBank,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, formatMonth } from "@/lib/utils";
import { HeroChart } from "@/components/dashboard/hero-chart";
import { CategoryBars } from "@/components/dashboard/category-bars";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend";

type SearchParams = { month?: string; trend?: string };

const TREND_OPTIONS = [3, 6, 12] as const;
type TrendWindow = (typeof TREND_OPTIONS)[number];

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: accounts }, { data: tx }] = await Promise.all([
    supabase.from("accounts").select("id, name").order("created_at"),
    supabase
      .from("transactions")
      .select("id, booked_at, amount, description, category_id, categories(name, color, kind)")
      .order("booked_at", { ascending: false })
      .limit(5000),
  ]);

  if (!accounts || accounts.length === 0) return <EmptyState kind="no-account" />;
  if (!tx || tx.length === 0) return <EmptyState kind="no-tx" />;

  const params = await searchParams;

  // ── Trend window ─────────────────────────────────────────────────────────────
  const trendMonths: TrendWindow = (TREND_OPTIONS as readonly number[]).includes(
    Number(params.trend),
  )
    ? (Number(params.trend) as TrendWindow)
    : 12;

  // ── Period resolution ─────────────────────────────────────────────────────────
  const mostRecentDate = new Date(tx[0].booked_at);
  const latestMonthStart = new Date(
    Date.UTC(mostRecentDate.getUTCFullYear(), mostRecentDate.getUTCMonth(), 1),
  );

  let periodStart: Date;
  if (params.month && /^\d{4}-\d{2}$/.test(params.month)) {
    const [y, m] = params.month.split("-").map(Number);
    periodStart = new Date(Date.UTC(y, m - 1, 1));
  } else {
    periodStart = latestMonthStart;
  }

  const periodEnd = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
  );

  // ── Navigation ────────────────────────────────────────────────────────────────
  const prevMonthStart = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - 1, 1),
  );
  const nextMonthStart = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 1),
  );
  const isLatestMonth = periodStart.getTime() >= latestMonthStart.getTime();

  function toMonthParam(d: Date) {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  function buildUrl(month: string, trend: number = trendMonths) {
    const sp = new URLSearchParams();
    sp.set("month", month);
    if (trend !== 12) sp.set("trend", String(trend));
    return `/dashboard?${sp.toString()}`;
  }

  // ── Helper ──────────────────────────────────────────────────────────────────
  type TxRow = (typeof tx)[number];
  const catKind = (t: TxRow): string | null =>
    (t.categories as unknown as { name: string; color: string; kind: string } | null)?.kind ?? null;

  // ── Period filter ─────────────────────────────────────────────────────────────
  const inPeriod = tx.filter((t) => {
    const d = new Date(t.booked_at);
    return d >= periodStart && d < periodEnd;
  });

  const operational = inPeriod.filter((t) => catKind(t) !== "transfer");
  const inPeriodTransfers = inPeriod.filter((t) => catKind(t) === "transfer");
  const transferCount = inPeriodTransfers.length;
  const transferVolume = inPeriodTransfers.reduce((s, t) => s + Math.abs(Number(t.amount)), 0);

  // ── KPIs ─────────────────────────────────────────────────────────────────────
  const income = operational
    .filter((t) => Number(t.amount) > 0)
    .reduce((s, t) => s + Number(t.amount), 0);
  const expense = operational
    .filter((t) => Number(t.amount) < 0)
    .reduce((s, t) => s + Number(t.amount), 0);
  const net = income + expense;
  const savingsRate = income > 0 ? (net / income) * 100 : null;

  // ── Previous period comparison ────────────────────────────────────────────────
  const prevPeriodStart = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - 1, 1),
  );
  const prevNet = tx
    .filter((t) => {
      const d = new Date(t.booked_at);
      return d >= prevPeriodStart && d < periodStart && catKind(t) !== "transfer";
    })
    .reduce((s, t) => s + Number(t.amount), 0);

  // ── Daily cumulative for hero chart ──────────────────────────────────────────
  const daysInMonth = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const dailyNetMap = new Map<number, number>();
  for (const t of operational) {
    const day = new Date(t.booked_at).getUTCDate();
    dailyNetMap.set(day, (dailyNetMap.get(day) ?? 0) + Number(t.amount));
  }
  let cumulative = 0;
  const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    cumulative += dailyNetMap.get(day) ?? 0;
    return { day, value: Math.round(cumulative * 100) / 100 };
  });

  // ── Category breakdown ────────────────────────────────────────────────────────
  const categoryTotals = new Map<string, { name: string; color: string; total: number }>();
  for (const t of operational) {
    if (Number(t.amount) >= 0) continue;
    const cat = t.categories as unknown as { name: string; color: string; kind: string } | null;
    const key = cat?.name ?? "Non catégorisé";
    const color = cat?.color ?? "#94a3b8";
    const entry = categoryTotals.get(key) ?? { name: key, color, total: 0 };
    entry.total += Math.abs(Number(t.amount));
    categoryTotals.set(key, entry);
  }
  const categoryData = Array.from(categoryTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  // ── Monthly trend ─────────────────────────────────────────────────────────────
  const monthlyMap = new Map<string, { month: string; income: number; expense: number }>();
  for (const t of tx) {
    if (catKind(t) === "transfer") continue;
    const d = new Date(t.booked_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key) ?? { month: key, income: 0, expense: 0 };
    const amt = Number(t.amount);
    if (amt > 0) entry.income += amt;
    else entry.expense += Math.abs(amt);
    monthlyMap.set(key, entry);
  }
  const monthlyData = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-trendMonths);

  // ── Recent transactions (selected period) ────────────────────────────────────
  const recentTx = inPeriod.slice(0, 5).map((t) => ({
    id: t.id,
    bookedAt: t.booked_at,
    description: t.description,
    amount: Number(t.amount),
    cat: t.categories as unknown as { name: string; color: string } | null,
    isTransfer: catKind(t) === "transfer",
  }));

  const now = new Date();
  const isCurrentMonth =
    periodStart.getUTCFullYear() === now.getUTCFullYear() &&
    periodStart.getUTCMonth() === now.getUTCMonth();

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isCurrentMonth ? "Mois en cours" : "Mois sélectionné"}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Month navigation */}
          <div className="flex items-center rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
            <Link href={buildUrl(toMonthParam(prevMonthStart))}>
              <button
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                aria-label="Mois précédent"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            </Link>
            <span className="min-w-[140px] select-none text-center text-sm font-medium capitalize">
              {formatMonth(periodStart)}
            </span>
            {isLatestMonth ? (
              <button
                disabled
                className="flex h-8 w-8 cursor-not-allowed items-center justify-center rounded-md text-zinc-700"
                aria-label="Mois suivant"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <Link href={buildUrl(toMonthParam(nextMonthStart))}>
                <button
                  className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-white/[0.06] hover:text-zinc-200"
                  aria-label="Mois suivant"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </Link>
            )}
          </div>

          <Link
            href="/transactions"
            className="flex items-center gap-1.5 text-sm text-zinc-600 transition-colors hover:text-foreground"
          >
            Transactions <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* ── Hero chart ──────────────────────────────────────────────────── */}
      <HeroChart
        dailyData={dailyData}
        net={net}
        income={income}
        expense={Math.abs(expense)}
        prevNet={prevNet}
        month={formatMonth(periodStart)}
      />

      {/* ── KPI row ─────────────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Revenus"
          value={formatCurrency(income)}
          icon={<ArrowUpRight className="h-4 w-4" />}
          tone="positive"
        />
        <KpiCard
          label="Dépenses"
          value={formatCurrency(Math.abs(expense))}
          icon={<ArrowDownRight className="h-4 w-4" />}
          tone="negative"
        />
        <KpiCard
          label="Taux d'épargne"
          value={
            savingsRate !== null
              ? `${savingsRate >= 0 ? "+" : ""}${savingsRate.toFixed(1)}%`
              : "—"
          }
          icon={<PiggyBank className="h-4 w-4" />}
          tone={savingsRate === null ? "neutral" : savingsRate >= 0 ? "positive" : "negative"}
        />
      </div>

      {/* ── Transfer exclusion notice ────────────────────────────────────── */}
      {transferCount > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary/50" />
          {transferCount} transfert{transferCount > 1 ? "s" : ""} inter-comptes exclu
          {transferCount > 1 ? "s" : ""} ({formatCurrency(transferVolume)} mouvementés, hors
          débit/crédit)
        </p>
      )}

      {/* ── Two-column row ──────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Top catégories */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Top catégories
            </CardTitle>
            <p className="text-2xl font-bold">{formatCurrency(Math.abs(expense))}</p>
          </CardHeader>
          <CardContent>
            <CategoryBars data={categoryData} />
          </CardContent>
        </Card>

        {/* Transactions récentes du mois sélectionné */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
              Récentes
            </CardTitle>
            <p className="text-2xl font-bold">
              {recentTx.length > 0 ? `${recentTx.length} dernières` : "Aucune"}
            </p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            {recentTx.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                Aucune transaction ce mois.
              </p>
            ) : (
              <ul>
                {recentTx.map((t, i) => (
                  <li
                    key={t.id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-6 py-3 text-sm",
                      i < recentTx.length - 1 && "border-b border-white/[0.04]",
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      {t.cat ? (
                        <span
                          className="inline-block h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: t.cat.color }}
                        />
                      ) : (
                        <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-zinc-700" />
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate font-medium">{t.description}</p>
                          {t.isTransfer && (
                            <span className="shrink-0 rounded px-1 py-0 text-[10px] font-semibold uppercase tracking-wide text-primary/60 ring-1 ring-primary/20">
                              virement
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{formatDate(t.bookedAt)}</p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 font-semibold tabular-nums",
                        t.isTransfer
                          ? "text-muted-foreground"
                          : t.amount >= 0
                          ? "text-blue-400"
                          : "text-red-400",
                      )}
                    >
                      {t.amount >= 0 ? "+" : ""}
                      {formatCurrency(t.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="px-6 pt-2">
              <Link
                href="/transactions"
                className="text-xs text-zinc-600 transition-colors hover:text-foreground"
              >
                Voir toutes →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Monthly trend ───────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
                Tendance mensuelle
              </CardTitle>
              <p className="mt-1 text-2xl font-bold">Revenus &amp; Dépenses</p>
            </div>
            {/* Trend window selector */}
            <div className="flex items-center rounded-lg border border-white/[0.07] bg-white/[0.02] p-0.5">
              {TREND_OPTIONS.map((n) => (
                <Link key={n} href={buildUrl(toMonthParam(periodStart), n)}>
                  <button
                    className={cn(
                      "rounded-md px-3 py-1.5 text-xs font-medium transition-all",
                      trendMonths === n
                        ? "bg-white/[0.08] text-foreground shadow-[0_1px_0_rgba(255,255,255,0.04)_inset]"
                        : "cursor-pointer text-zinc-600 hover:text-zinc-300",
                    )}
                  >
                    {n}m
                  </button>
                </Link>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <MonthlyTrendChart data={monthlyData} />
        </CardContent>
      </Card>

    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "positive" | "negative" | "neutral";
}) {
  const lineColor =
    tone === "positive"
      ? "bg-primary/50"
      : tone === "negative"
      ? "bg-destructive/50"
      : "bg-transparent";

  const iconClass =
    tone === "positive"
      ? "bg-blue-400/[0.08] text-blue-400"
      : tone === "negative"
      ? "bg-red-400/[0.08] text-red-400"
      : "bg-white/[0.04] text-zinc-600";

  const valueColor =
    tone === "positive" ? "" : tone === "negative" ? "text-red-400" : "";

  return (
    <Card className="overflow-hidden">
      <div className={cn("h-px w-full", lineColor)} />
      <CardContent className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600">
            {label}
          </span>
          <span className={cn("flex h-7 w-7 items-center justify-center rounded-lg", iconClass)}>
            {icon}
          </span>
        </div>
        <p className={cn("text-2xl font-bold leading-none tabular-nums", valueColor)}>{value}</p>
      </CardContent>
    </Card>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ kind }: { kind: "no-account" | "no-tx" }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-5 text-center">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
        <FileUp className="h-6 w-6 text-primary" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">
          {kind === "no-account" ? "Crée ton premier compte" : "Importe tes premières transactions"}
        </h2>
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
          {kind === "no-account"
            ? "Commence par déclarer un compte bancaire. Tu pourras ensuite y importer un CSV ou PDF."
            : "Dépose un CSV ou PDF de relevé bancaire — le dashboard se remplit automatiquement."}
        </p>
      </div>
      <Link
        href={kind === "no-account" ? "/accounts" : "/import"}
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {kind === "no-account" ? "Créer un compte" : "Importer un fichier"}
      </Link>
    </div>
  );
}
