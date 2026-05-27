import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight, FileUp, PiggyBank } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { cn, formatCurrency, formatDate, formatMonth } from "@/lib/utils";
import { HeroChart } from "@/components/dashboard/hero-chart";
import { CategoryBars } from "@/components/dashboard/category-bars";
import { MonthlyTrendChart } from "@/components/dashboard/monthly-trend";

export default async function DashboardPage() {
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

  // ── Period ──────────────────────────────────────────────────────────────────
  const mostRecentDate = new Date(tx[0].booked_at);
  const periodStart = new Date(
    Date.UTC(mostRecentDate.getUTCFullYear(), mostRecentDate.getUTCMonth(), 1),
  );
  const periodEnd = new Date(
    Date.UTC(mostRecentDate.getUTCFullYear(), mostRecentDate.getUTCMonth() + 1, 1),
  );

  const inPeriod = tx.filter((t) => {
    const d = new Date(t.booked_at);
    return d >= periodStart && d < periodEnd;
  });

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const income  = inPeriod.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const expense = inPeriod.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0);
  const net     = income + expense;
  const savingsRate = income > 0 ? (net / income) * 100 : null;

  // ── Previous period (for comparison) ────────────────────────────────────────
  const prevPeriodStart = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() - 1, 1),
  );
  const prevInPeriod = tx.filter((t) => {
    const d = new Date(t.booked_at);
    return d >= prevPeriodStart && d < periodStart;
  });
  const prevNet = prevInPeriod.reduce((s, t) => s + Number(t.amount), 0);

  // ── Daily cumulative (for hero area chart) ───────────────────────────────────
  const daysInMonth = new Date(
    Date.UTC(periodStart.getUTCFullYear(), periodStart.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const dailyNetMap = new Map<number, number>();
  for (const t of inPeriod) {
    const day = new Date(t.booked_at).getUTCDate();
    dailyNetMap.set(day, (dailyNetMap.get(day) ?? 0) + Number(t.amount));
  }
  let cumulative = 0;
  const dailyData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    cumulative += dailyNetMap.get(day) ?? 0;
    return { day, value: Math.round(cumulative * 100) / 100 };
  });

  // ── Category breakdown ───────────────────────────────────────────────────────
  const categoryTotals = new Map<string, { name: string; color: string; total: number }>();
  for (const t of inPeriod) {
    if (Number(t.amount) >= 0) continue;
    const cat = (t.categories as unknown as { name: string; color: string; kind: string } | null);
    const key   = cat?.name  ?? "Non catégorisé";
    const color = cat?.color ?? "#94a3b8";
    const entry = categoryTotals.get(key) ?? { name: key, color, total: 0 };
    entry.total += Math.abs(Number(t.amount));
    categoryTotals.set(key, entry);
  }
  const categoryData = Array.from(categoryTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 7);

  // ── Monthly trend (12 months) ────────────────────────────────────────────────
  const monthlyMap = new Map<string, { month: string; income: number; expense: number }>();
  for (const t of tx) {
    const d   = new Date(t.booked_at);
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const entry = monthlyMap.get(key) ?? { month: key, income: 0, expense: 0 };
    const amt = Number(t.amount);
    if (amt > 0) entry.income += amt;
    else entry.expense += Math.abs(amt);
    monthlyMap.set(key, entry);
  }
  const monthlyData = Array.from(monthlyMap.values())
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);

  // ── Recent transactions ──────────────────────────────────────────────────────
  const recentTx = tx.slice(0, 5).map((t) => ({
    id: t.id,
    bookedAt: t.booked_at,
    description: t.description,
    amount: Number(t.amount),
    cat: (t.categories as unknown as { name: string; color: string } | null),
  }));

  const now = new Date();
  const isCurrentMonth =
    periodStart.getUTCFullYear() === now.getUTCFullYear() &&
    periodStart.getUTCMonth()    === now.getUTCMonth();

  return (
    <div className="space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {isCurrentMonth ? "Ce mois-ci" : formatMonth(periodStart)}
            {!isCurrentMonth && (
              <span className="ml-1 text-xs opacity-60">
                — dernier mois avec données
              </span>
            )}
          </p>
        </div>
        <Link
          href="/transactions"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Toutes les transactions <ArrowRight className="h-3.5 w-3.5" />
        </Link>
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

      {/* ── Two-column row ──────────────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-2">

        {/* Top catégories */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Top catégories
            </CardTitle>
            <p className="text-2xl font-bold">{formatCurrency(Math.abs(expense))}</p>
          </CardHeader>
          <CardContent>
            <CategoryBars data={categoryData} />
          </CardContent>
        </Card>

        {/* Transactions récentes */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Récentes
            </CardTitle>
            <p className="text-2xl font-bold">{recentTx.length} dernières</p>
          </CardHeader>
          <CardContent className="p-0 pb-2">
            <ul>
              {recentTx.map((t, i) => (
                <li
                  key={t.id}
                  className={cn(
                    "flex items-center justify-between gap-3 px-6 py-3 text-sm",
                    i < recentTx.length - 1 && "border-b border-border",
                  )}
                >
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    {t.cat ? (
                      <span
                        className="inline-block h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: t.cat.color }}
                      />
                    ) : (
                      <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-muted-foreground/30" />
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.description}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.bookedAt)}</p>
                    </div>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 font-semibold tabular-nums",
                      t.amount >= 0 ? "text-green-500" : "text-red-500",
                    )}
                  >
                    {t.amount >= 0 ? "+" : ""}
                    {formatCurrency(t.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="px-6 pt-2">
              <Link
                href="/transactions"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
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
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Tendance 12 mois
          </CardTitle>
          <p className="text-2xl font-bold">Revenus &amp; Dépenses</p>
        </CardHeader>
        <CardContent>
          <MonthlyTrendChart data={monthlyData} />
        </CardContent>
      </Card>

    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────

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
  const iconColor =
    tone === "positive" ? "text-green-500"
    : tone === "negative" ? "text-red-500"
    : "text-muted-foreground";

  const valueColor =
    tone === "positive" ? "text-green-500"
    : tone === "negative" ? "text-red-500"
    : "";

  return (
    <Card>
      <CardContent className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <span className={iconColor}>{icon}</span>
        </div>
        <p className={cn("text-2xl font-bold tabular-nums", valueColor)}>{value}</p>
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
        className="rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        {kind === "no-account" ? "Créer un compte" : "Importer un fichier"}
      </Link>
    </div>
  );
}
