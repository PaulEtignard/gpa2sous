import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, ChevronRight, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { deleteTransaction } from "./actions";
import { AiCategorizeButton } from "@/components/transactions/ai-categorize-button";
import { CategoryCombobox } from "@/components/transactions/category-combobox";
import { DescriptionRuleCreator } from "@/components/transactions/description-rule-creator";
import { FilterSelect } from "@/components/transactions/filter-select";
import type { CategorizationSource } from "@/types/database";

const PAGE_SIZE = 50;

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  // NOTE: <div> rather than <label> — a label that wraps a <button> can
  // intercept clicks in some browsers and interferes with the FilterSelect
  // trigger. The header span is purely cosmetic so no label association
  // is required.
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      {children}
    </div>
  );
}

type Params = {
  account?: string;
  cat?: string;
  type?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** Reconstruct the current URL search string, overriding specific keys. */
function buildUrl(base: Params, overrides: Partial<Params>): string {
  const merged = { ...base, ...overrides };
  const sp = new URLSearchParams();
  if (merged.account) sp.set("account", merged.account);
  if (merged.cat)     sp.set("cat",     merged.cat);
  if (merged.type)    sp.set("type",    merged.type);
  if (merged.q)       sp.set("q",       merged.q);
  if (merged.from)    sp.set("from",    merged.from);
  if (merged.to)      sp.set("to",      merged.to);
  if (merged.page && merged.page !== "1") sp.set("page", merged.page);
  const qs = sp.toString();
  return `/transactions${qs ? `?${qs}` : ""}`;
}

/** Compact page-number list with "…" gaps. */
function visiblePages(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | "…")[] = [1];
  if (current > 3)           pages.push("…");
  for (let p = Math.max(2, current - 1); p <= Math.min(total - 1, current + 1); p++) {
    pages.push(p);
  }
  if (current < total - 2)   pages.push("…");
  pages.push(total);
  return pages;
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;
  const page   = Math.max(1, parseInt(params.page ?? "1", 10));
  const offset = (page - 1) * PAGE_SIZE;

  // ── Main query — all filters pushed to DB, paginated ──────────────────────
  let txQuery = supabase
    .from("transactions")
    .select(
      "id, booked_at, description, amount, currency, account_id, category_id, transfer_id, categorization_source, accounts(name), categories(name, color, kind)",
      { count: "exact" },
    )
    .order("booked_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.account)              txQuery = txQuery.eq("account_id", params.account);
  if (params.cat === "uncategorized") txQuery = txQuery.is("category_id", null);
  else if (params.cat)             txQuery = txQuery.eq("category_id", params.cat);
  if (params.type === "credit")    txQuery = txQuery.gt("amount", 0);
  if (params.type === "debit")     txQuery = txQuery.lt("amount", 0);
  if (params.q)                    txQuery = txQuery.ilike("description", `%${params.q}%`);
  if (params.from)                 txQuery = txQuery.gte("booked_at", params.from);
  if (params.to)                   txQuery = txQuery.lte("booked_at", params.to + "T23:59:59");

  // Run all independent queries in one round-trip
  const [
    { data: transactions, count: totalCount },
    { data: accounts },
    { data: categories },
    { count: uncategorizedCount },
    { data: activeJob },
    { data: statsRaw },
  ] = await Promise.all([
    txQuery,
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("categories").select("id, name, color").order("kind").order("name"),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .is("category_id", null),
    supabase
      .from("jobs")
      .select("id")
      .eq("user_id", user.id)
      .eq("type", "ai_categorize")
      .in("status", ["pending", "running"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Empty-string params come from form-submitted blank inputs and must be
    // treated as "no filter" (null), otherwise the RPC's branches like
    // `p_type IS NULL OR p_type = 'credit'` evaluate to false and silently
    // zero out the KPIs even though the table itself shows rows.
    supabase.rpc("get_transaction_stats", {
      p_account_id:    params.account || null,
      p_category_id:   params.cat && params.cat !== "uncategorized" ? params.cat : null,
      p_uncategorized: params.cat === "uncategorized",
      p_type:          params.type   || null,
      p_search:        params.q      || null,
      p_from:          params.from   || null,
      p_to:            params.to ? params.to + "T23:59:59" : null,
    }),
  ]);

  // ── Unpack RPC result ──────────────────────────────────────────────────────
  type CatStat = { name: string; color: string; total: number; count: number };
  const stats = statsRaw as {
    total_expenses: number;
    total_income:   number;
    count_expenses: number;
    count_income:   number;
    total_count:    number;
    by_category:    CatStat[];
  } | null;

  const totalExpenses = stats?.total_expenses ?? 0;
  const totalIncome   = stats?.total_income   ?? 0;
  const netBalance    = totalIncome + totalExpenses;
  const catStats      = stats?.by_category ?? [];
  const maxExpense    = catStats.length > 0 ? Math.abs(catStats[0].total) : 1;

  const total      = totalCount ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const from       = total === 0 ? 0 : offset + 1;
  const to         = Math.min(offset + PAGE_SIZE, total);

  return (
    <div className="space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {total > 0
              ? `${from}–${to} sur ${total} transaction${total > 1 ? "s" : ""}`
              : "Aucune transaction"}
          </p>
        </div>
        <AiCategorizeButton
          uncategorizedCount={uncategorizedCount ?? 0}
          activeJobId={activeJob?.id ?? null}
        />
      </div>

      {/* ── Filters ───────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-5">
          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3 lg:grid-cols-6">
              <FilterField label="Compte">
                <FilterSelect
                  key={`account-${params.account ?? ""}`}
                  name="account"
                  defaultValue={params.account ?? ""}
                  placeholder="Tous"
                  autoSubmit
                  options={[
                    { value: "", label: "Tous" },
                    ...(accounts ?? []).map((a) => ({ value: a.id, label: a.name })),
                  ]}
                />
              </FilterField>

              <FilterField label="Catégorie">
                <FilterSelect
                  key={`cat-${params.cat ?? ""}`}
                  name="cat"
                  defaultValue={params.cat ?? ""}
                  placeholder="Toutes"
                  searchable
                  autoSubmit
                  options={[
                    { value: "", label: "Toutes" },
                    { value: "uncategorized", label: "Non catégorisées" },
                    ...(categories ?? []).map((c) => ({
                      value: c.id,
                      label: c.name,
                      color: c.color,
                    })),
                  ]}
                />
              </FilterField>

              <FilterField label="Type">
                <FilterSelect
                  key={`type-${params.type ?? ""}`}
                  name="type"
                  defaultValue={params.type ?? ""}
                  placeholder="Tous"
                  autoSubmit
                  options={[
                    { value: "",       label: "Tous" },
                    { value: "credit", label: "Crédits" },
                    { value: "debit",  label: "Débits" },
                  ]}
                />
              </FilterField>

              <FilterField label="Du">
                <input
                  type="date"
                  name="from"
                  defaultValue={params.from ?? ""}
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all [color-scheme:dark]"
                />
              </FilterField>

              <FilterField label="Au">
                <input
                  type="date"
                  name="to"
                  defaultValue={params.to ?? ""}
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-sm text-foreground focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all [color-scheme:dark]"
                />
              </FilterField>

              <FilterField label="Recherche">
                <input
                  name="q"
                  defaultValue={params.q ?? ""}
                  placeholder="Ex : carrefour"
                  className="h-9 w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2 text-sm text-foreground placeholder:text-zinc-700 focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 transition-all"
                />
              </FilterField>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-white/[0.04] pt-3">
              {(params.account || params.cat || params.type || params.q || params.from || params.to) && (
                <Link href="/transactions">
                  <Button type="button" size="sm" variant="ghost" className="text-muted-foreground">
                    Réinitialiser
                  </Button>
                </Link>
              )}
              <Button type="submit" size="sm" variant="outline">
                Filtrer
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* ── Stats — always shown, even when the filter narrows results ────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Dépenses</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-destructive">
            {formatCurrency(totalExpenses)}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats?.count_expenses ?? 0} transaction{(stats?.count_expenses ?? 0) > 1 ? "s" : ""}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Revenus</p>
          <p className="mt-1 text-xl font-bold tabular-nums text-success">
            +{formatCurrency(totalIncome)}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats?.count_income ?? 0} transaction{(stats?.count_income ?? 0) > 1 ? "s" : ""}
          </p>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Solde net</p>
          <p className={cn("mt-1 text-xl font-bold tabular-nums", netBalance >= 0 ? "text-success" : "text-destructive")}>
            {netBalance >= 0 ? "+" : ""}{formatCurrency(netBalance)}
          </p>
          <p className="text-xs text-muted-foreground">
            {stats?.total_count ?? 0} transaction{(stats?.total_count ?? 0) > 1 ? "s" : ""} au total
          </p>
        </div>
      </div>

      {/* ── Répartition par catégorie — always shown ───────────────────────── */}
      <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Dépenses par catégorie
        </p>
        {catStats.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Aucune dépense catégorisée sur ce filtre.
          </p>
        ) : (
          <div className="space-y-2.5">
            {catStats.map((c) => (
              <div key={c.name} className="flex items-center gap-3">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: c.color }}
                />
                <span className="w-36 truncate text-sm text-foreground">{c.name}</span>
                <div className="relative flex-1 h-1.5 rounded-full bg-white/[0.05]">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full opacity-70"
                    style={{
                      width: `${(Math.abs(c.total) / maxExpense) * 100}%`,
                      backgroundColor: c.color,
                    }}
                  />
                </div>
                <span className="w-24 text-right font-mono text-sm tabular-nums text-destructive">
                  {formatCurrency(c.total)}
                </span>
                <span className="w-20 text-right text-xs text-muted-foreground">
                  {c.count} tx
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Table ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="hidden lg:table-cell">Compte</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>

            <TableBody>
              {(transactions ?? []).map((t) => {
                const account    = t.accounts    as unknown as { name: string } | null;
                const cat        = t.categories  as unknown as { name: string; color: string; kind: string } | null;
                const isTransferKind = cat?.kind === "transfer";
                const isPaired       = t.transfer_id != null;
                const isTransfer     = isTransferKind || isPaired;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(t.booked_at)}
                    </TableCell>

                    <TableCell className="min-w-[260px] max-w-[480px]">
                      <div className="flex items-start gap-2">
                        <div className="min-w-0 flex-1">
                          <DescriptionRuleCreator
                            description={t.description}
                            categories={categories ?? []}
                          />
                        </div>
                        {isTransfer && (
                          <span
                            className="mt-0.5 shrink-0 rounded px-1 text-[10px] font-semibold uppercase tracking-wide text-primary/60 ring-1 ring-primary/20"
                            title={isPaired ? "Virement inter-comptes appairé" : "Catégorie de transfert"}
                          >
                            virement
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {account?.name ?? "—"}
                    </TableCell>

                    <TableCell>
                      <CategoryCombobox
                        transactionId={t.id}
                        description={t.description}
                        categoryId={t.category_id ?? null}
                        source={(t.categorization_source ?? null) as CategorizationSource}
                        isTransfer={isTransfer}
                        categories={categories ?? []}
                      />
                    </TableCell>

                    <TableCell
                      className={cn(
                        "text-right font-mono tabular-nums",
                        isTransfer
                          ? "text-muted-foreground"
                          : Number(t.amount) < 0
                          ? "text-destructive"
                          : "text-success",
                      )}
                    >
                      {formatCurrency(Number(t.amount), t.currency)}
                    </TableCell>

                    <TableCell>
                      <form action={deleteTransaction}>
                        <input type="hidden" name="id" value={t.id} />
                        <Button type="submit" variant="ghost" size="icon" className="h-8 w-8">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}

              {(transactions ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-16 text-center text-sm text-muted-foreground">
                    {params.account || params.cat || params.q || params.from || params.to
                      ? "Aucune transaction ne correspond aux filtres."
                      : <>Aucune transaction. <Link href="/import" className="text-primary hover:underline">Importer un fichier →</Link></>}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>

          {/* ── Pagination ──────────────────────────────────────────────── */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3">
              <p className="text-xs text-muted-foreground">
                {from}–{to} sur {total}
              </p>

              <div className="flex items-center gap-1">
                {/* Previous */}
                {page > 1 ? (
                  <Link href={buildUrl(params, { page: String(page - 1) })}>
                    <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                  </Link>
                ) : (
                  <button disabled className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/30">
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                )}

                {/* Page numbers */}
                {visiblePages(page, totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`gap-${i}`} className="flex h-8 w-8 items-center justify-center text-xs text-muted-foreground">
                      …
                    </span>
                  ) : (
                    <Link key={p} href={buildUrl(params, { page: String(p) })}>
                      <button
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-md text-xs font-medium transition-colors",
                          p === page
                            ? "bg-primary text-primary-foreground"
                            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                        )}
                      >
                        {p}
                      </button>
                    </Link>
                  ),
                )}

                {/* Next */}
                {page < totalPages ? (
                  <Link href={buildUrl(params, { page: String(page + 1) })}>
                    <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </Link>
                ) : (
                  <button disabled className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground/30">
                    <ChevronRight className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
