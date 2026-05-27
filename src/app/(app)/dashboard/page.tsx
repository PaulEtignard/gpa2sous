import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, FileUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatMonth } from "@/lib/utils";
import { SpendingByCategoryChart } from "@/components/dashboard/spending-by-category";
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
      .select("id, booked_at, amount, category_id, categories(name, color, kind)")
      .order("booked_at", { ascending: false })
      .limit(5000),
  ]);

  if (!accounts || accounts.length === 0) {
    return <EmptyState kind="no-account" />;
  }
  if (!tx || tx.length === 0) {
    return <EmptyState kind="no-tx" />;
  }

  // Pick the most-recent month that has data — much more useful than "this
  // month" when the user just imported an older statement.
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

  const income = inPeriod.filter((t) => Number(t.amount) > 0).reduce((s, t) => s + Number(t.amount), 0);
  const expense = inPeriod.filter((t) => Number(t.amount) < 0).reduce((s, t) => s + Number(t.amount), 0);
  const net = income + expense;

  const categoryTotals = new Map<string, { name: string; color: string; total: number }>();
  for (const t of inPeriod) {
    if (Number(t.amount) >= 0) continue;
    const cat = (t.categories as unknown as { name: string; color: string; kind: string } | null) ?? null;
    const key = cat?.name ?? "Non catégorisé";
    const color = cat?.color ?? "#94a3b8";
    const existing = categoryTotals.get(key) ?? { name: key, color, total: 0 };
    existing.total += Math.abs(Number(t.amount));
    categoryTotals.set(key, existing);
  }
  const categoryData = Array.from(categoryTotals.values())
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);

  const monthlyMap = new Map<string, { month: string; income: number; expense: number }>();
  for (const t of tx) {
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
    .slice(-12);

  const now = new Date();
  const isCurrentMonth =
    periodStart.getUTCFullYear() === now.getUTCFullYear() &&
    periodStart.getUTCMonth() === now.getUTCMonth();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tableau de bord</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            Période :
            <Badge variant="secondary" className="capitalize">
              {formatMonth(periodStart)}
            </Badge>
            {!isCurrentMonth && (
              <span className="text-xs">
                — mois le plus récent avec des données ({tx.length} transactions au total)
              </span>
            )}
          </div>
        </div>
        <Link href="/transactions">
          <Button variant="outline" size="sm">
            Voir toutes les transactions
          </Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <KpiCard
          label="Revenus"
          value={formatCurrency(income)}
          icon={<ArrowUpRight className="h-4 w-4 text-success" />}
        />
        <KpiCard
          label="Dépenses"
          value={formatCurrency(Math.abs(expense))}
          icon={<ArrowDownRight className="h-4 w-4 text-destructive" />}
        />
        <KpiCard
          label="Solde net"
          value={formatCurrency(net)}
          icon={<Wallet className="h-4 w-4 text-primary" />}
          tone={net >= 0 ? "positive" : "negative"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Évolution mensuelle</CardTitle>
            <CardDescription>12 derniers mois — revenus vs dépenses</CardDescription>
          </CardHeader>
          <CardContent>
            <MonthlyTrendChart data={monthlyData} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Top catégories — {formatMonth(periodStart)}</CardTitle>
            <CardDescription>Répartition des dépenses</CardDescription>
          </CardHeader>
          <CardContent>
            <SpendingByCategoryChart data={categoryData} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{label}</span>
          {icon}
        </div>
        <div
          className={`mt-2 text-2xl font-bold ${
            tone === "positive" ? "text-success" : tone === "negative" ? "text-destructive" : ""
          }`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function EmptyState({ kind }: { kind: "no-account" | "no-tx" }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center gap-4 p-12 text-center">
        <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
          <FileUp className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h2 className="text-lg font-semibold">
            {kind === "no-account" ? "Crée ton premier compte" : "Importe tes premières transactions"}
          </h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            {kind === "no-account"
              ? "Commence par déclarer un compte bancaire (courant, livret, carte…). Tu pourras y importer ton CSV ou ton PDF."
              : "Va sur la page Import et dépose un CSV ou un PDF de relevé. Tu verras ton dashboard se remplir."}
          </p>
        </div>
        <Link href={kind === "no-account" ? "/accounts" : "/import"}>
          <Button>{kind === "no-account" ? "Créer un compte" : "Importer un fichier"}</Button>
        </Link>
      </CardContent>
    </Card>
  );
}
