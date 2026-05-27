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
import { CategorySelect } from "@/components/transactions/category-select";
import { DescriptionRuleCreator } from "@/components/transactions/description-rule-creator";

const PAGE_SIZE = 50;

type Params = {
  account?: string;
  cat?: string;
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
      "id, booked_at, description, amount, currency, account_id, category_id, accounts(name), categories(name, color, kind)",
      { count: "exact" },
    )
    .order("booked_at", { ascending: false })
    .range(offset, offset + PAGE_SIZE - 1);

  if (params.account)              txQuery = txQuery.eq("account_id", params.account);
  if (params.cat === "uncategorized") txQuery = txQuery.is("category_id", null);
  else if (params.cat)             txQuery = txQuery.eq("category_id", params.cat);
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
  ]);

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
        <CardContent className="p-4">
          {/* Filters reset page to 1 automatically (no hidden page input) */}
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Compte</label>
              <select
                name="account"
                defaultValue={params.account ?? ""}
                className="h-9 rounded-md border border-input bg-secondary px-2 text-sm"
              >
                <option value="">Tous</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
              <select
                name="cat"
                defaultValue={params.cat ?? ""}
                className="h-9 rounded-md border border-input bg-secondary px-2 text-sm"
              >
                <option value="">Toutes</option>
                <option value="uncategorized">Non catégorisées</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Du</label>
              <input
                type="date"
                name="from"
                defaultValue={params.from ?? ""}
                className="h-9 rounded-md border border-input bg-secondary px-2 text-sm [color-scheme:dark]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Au</label>
              <input
                type="date"
                name="to"
                defaultValue={params.to ?? ""}
                className="h-9 rounded-md border border-input bg-secondary px-2 text-sm [color-scheme:dark]"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Recherche</label>
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Ex : carrefour"
                className="h-9 rounded-md border border-input bg-secondary px-2 text-sm"
              />
            </div>

            <div className="flex gap-2">
              <Button type="submit" size="sm" variant="outline">
                Filtrer
              </Button>
              {(params.account || params.cat || params.q || params.from || params.to) && (
                <Link href="/transactions">
                  <Button type="button" size="sm" variant="ghost" className="text-muted-foreground">
                    Réinitialiser
                  </Button>
                </Link>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

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
                const isTransfer = cat?.kind === "transfer";
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {formatDate(t.booked_at)}
                    </TableCell>

                    <TableCell className="max-w-[260px]">
                      <div className="flex items-center gap-2">
                        <DescriptionRuleCreator
                          description={t.description}
                          categories={categories ?? []}
                        />
                        {isTransfer && (
                          <span className="shrink-0 rounded px-1 text-[10px] font-semibold uppercase tracking-wide text-primary/60 ring-1 ring-primary/20">
                            virement
                          </span>
                        )}
                      </div>
                    </TableCell>

                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {account?.name ?? "—"}
                    </TableCell>

                    <TableCell>
                      <CategorySelect
                        transactionId={t.id}
                        description={t.description}
                        categoryId={t.category_id ?? null}
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
