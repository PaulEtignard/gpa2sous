import { redirect } from "next/navigation";
import { TrendingDown, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn, formatCurrency, formatMonth } from "@/lib/utils";
import { setBudget } from "./actions";

interface Categ {
  id: string;
  name: string;
  color: string;
  kind: "income" | "expense" | "transfer";
}

interface Tx {
  category_id: string | null;
  amount: number;
  booked_at: string;
}

export default async function BudgetsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Look-back window for analysis: 6 months including the current one
  const now = new Date();
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
  const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));

  const [{ data: categories }, { data: budgets }, { data: tx }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color, kind")
      .eq("kind", "expense")
      .order("name"),
    supabase.from("budgets").select("category_id, monthly_amount"),
    supabase
      .from("transactions")
      .select("category_id, amount, booked_at")
      .gte("booked_at", windowStart.toISOString().slice(0, 10))
      .lt("booked_at", windowEnd.toISOString().slice(0, 10))
      .lt("amount", 0),
  ]);

  const cats = (categories ?? []) as Categ[];
  const txs = (tx ?? []) as Tx[];
  const budgetByCat = new Map(
    (budgets ?? []).map((b) => [b.category_id, Number(b.monthly_amount)]),
  );

  // Compute spending per (category, month) and per category over the window
  const monthKey = (d: Date) =>
    `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  const currentMonthKey = monthKey(now);
  const prevMonthKey = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));

  type Stat = {
    monthly: Map<string, number>;
    currentMonth: number;
    prevMonth: number;
    avg3: number;
    avg6: number;
  };
  const statsByCat = new Map<string, Stat>();

  for (const c of cats) {
    statsByCat.set(c.id, {
      monthly: new Map(),
      currentMonth: 0,
      prevMonth: 0,
      avg3: 0,
      avg6: 0,
    });
  }

  for (const t of txs) {
    if (!t.category_id) continue;
    const stat = statsByCat.get(t.category_id);
    if (!stat) continue;
    const key = monthKey(new Date(t.booked_at));
    const value = Math.abs(Number(t.amount));
    stat.monthly.set(key, (stat.monthly.get(key) ?? 0) + value);
  }

  for (const [, stat] of statsByCat) {
    stat.currentMonth = stat.monthly.get(currentMonthKey) ?? 0;
    stat.prevMonth = stat.monthly.get(prevMonthKey) ?? 0;
    const months3 = lastNMonthKeys(now, 3);
    const months6 = lastNMonthKeys(now, 6);
    stat.avg3 = avg(months3.map((m) => stat.monthly.get(m) ?? 0));
    stat.avg6 = avg(months6.map((m) => stat.monthly.get(m) ?? 0));
  }

  const totalCurrent = sum(Array.from(statsByCat.values()).map((s) => s.currentMonth));
  const totalBudget = sum(Array.from(budgetByCat.values()));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Budgets & analyse par catégorie</h1>
          <p className="text-sm text-muted-foreground capitalize">
            Période : {formatMonth(now)} — analyse sur 6 mois glissants
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <SummaryCard label="Dépensé ce mois" value={formatCurrency(totalCurrent)} />
        <SummaryCard label="Budget total" value={totalBudget > 0 ? formatCurrency(totalBudget) : "—"} />
        <SummaryCard
          label="Reste"
          value={totalBudget > 0 ? formatCurrency(totalBudget - totalCurrent) : "—"}
          tone={totalBudget > 0 && totalCurrent > totalBudget ? "negative" : "positive"}
        />
      </div>

      <div className="grid gap-3">
        {cats.map((c) => {
          const stat = statsByCat.get(c.id)!;
          const budget = budgetByCat.get(c.id) ?? 0;
          const ratio = budget > 0 ? Math.min(stat.currentMonth / budget, 1.5) : 0;
          const over = budget > 0 && stat.currentMonth > budget;
          const trend =
            stat.prevMonth === 0
              ? 0
              : ((stat.currentMonth - stat.prevMonth) / stat.prevMonth) * 100;

          // Sparkline data: last 6 months (oldest → newest)
          const months = lastNMonthKeys(now, 6).reverse();
          const sparkValues = months.map((m) => stat.monthly.get(m) ?? 0);
          const maxVal = Math.max(...sparkValues, 1);

          return (
            <Card key={c.id}>
              <CardContent className="space-y-3 p-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {formatCurrency(stat.currentMonth)}
                        {budget > 0 ? ` / ${formatCurrency(budget)}` : ""} ce mois ·
                        moy. 3m {formatCurrency(stat.avg3)} · moy. 6m {formatCurrency(stat.avg6)}
                      </div>
                    </div>
                  </div>

                  {stat.prevMonth > 0 && (
                    <Badge variant={trend > 5 ? "destructive" : trend < -5 ? "success" : "secondary"}>
                      {trend > 0 ? (
                        <TrendingUp className="mr-1 h-3 w-3" />
                      ) : (
                        <TrendingDown className="mr-1 h-3 w-3" />
                      )}
                      {trend > 0 ? "+" : ""}
                      {trend.toFixed(0)}% vs mois préc.
                    </Badge>
                  )}

                  <Sparkline values={sparkValues} max={maxVal} color={c.color} />

                  <form action={setBudget} className="flex items-center gap-2">
                    <input type="hidden" name="category_id" value={c.id} />
                    <Input
                      name="monthly_amount"
                      type="number"
                      step="0.01"
                      min="0"
                      defaultValue={budget || ""}
                      placeholder="Budget"
                      className="h-9 w-28"
                    />
                    <Button type="submit" size="sm" variant="outline">
                      OK
                    </Button>
                  </form>
                </div>

                {budget > 0 && (
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        over ? "bg-destructive" : ratio > 0.8 ? "bg-amber-500" : "bg-primary",
                      )}
                      style={{ width: `${Math.min(ratio * 100, 100)}%` }}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {cats.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Aucune catégorie de type "dépense". Va sur{" "}
              <a href="/categories" className="text-primary hover:underline">
                Catégories
              </a>{" "}
              pour en créer.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
}) {
  return (
    <Card>
      <CardHeader className="p-4 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-0">
        <div
          className={cn(
            "text-2xl font-bold",
            tone === "positive" && "text-success",
            tone === "negative" && "text-destructive",
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Sparkline({ values, max, color }: { values: number[]; max: number; color: string }) {
  const W = 80;
  const H = 24;
  if (values.length < 2) return <div style={{ width: W, height: H }} />;
  const step = W / (values.length - 1);
  const points = values
    .map((v, i) => `${i * step},${H - (v / max) * H}`)
    .join(" ");
  return (
    <svg width={W} height={H} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function lastNMonthKeys(from: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function sum(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0);
}
