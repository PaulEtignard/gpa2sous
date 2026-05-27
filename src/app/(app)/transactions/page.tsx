import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import { deleteTransaction, updateTransactionCategory } from "./actions";
import { AiCategorizeButton } from "@/components/transactions/ai-categorize-button";
import { CategorySelect } from "@/components/transactions/category-select";

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string; cat?: string; q?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const params = await searchParams;

  let query = supabase
    .from("transactions")
    .select("id, booked_at, description, amount, currency, account_id, category_id, accounts(name), categories(name, color)")
    .order("booked_at", { ascending: false })
    .limit(500);

  if (params.account) query = query.eq("account_id", params.account);
  if (params.cat === "uncategorized") query = query.is("category_id", null);
  else if (params.cat) query = query.eq("category_id", params.cat);
  if (params.q) query = query.ilike("description", `%${params.q}%`);

  const [
    { data: transactions },
    { data: accounts },
    { data: categories },
    { count: uncategorizedCount },
    { data: activeJob },
  ] = await Promise.all([
    query,
    supabase.from("accounts").select("id, name").order("name"),
    supabase.from("categories").select("id, name, color").order("kind").order("name"),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .is("category_id", null),
    // Check if a categorization job is already running for this user
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Transactions</h1>
          <p className="text-sm text-muted-foreground">
            {(transactions ?? []).length} dernières transactions (max 500).
          </p>
        </div>
        <AiCategorizeButton
          uncategorizedCount={uncategorizedCount ?? 0}
          activeJobId={activeJob?.id ?? null}
        />
      </div>

      <Card>
        <CardContent className="p-4">
          <form className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Compte</label>
              <select
                name="account"
                defaultValue={params.account ?? ""}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Tous</option>
                {(accounts ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Catégorie</label>
              <select
                name="cat"
                defaultValue={params.cat ?? ""}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Toutes</option>
                <option value="uncategorized">Non catégorisées</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Recherche</label>
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Ex: carrefour"
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Filtrer
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Compte</TableHead>
                <TableHead>Catégorie</TableHead>
                <TableHead className="text-right">Montant</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(transactions ?? []).map((t) => {
                const account = t.accounts as unknown as { name: string } | null;
                const cat = t.categories as unknown as { name: string; color: string } | null;
                return (
                  <TableRow key={t.id}>
                    <TableCell className="font-mono text-xs">{formatDate(t.booked_at)}</TableCell>
                    <TableCell className="max-w-[280px] truncate font-medium">{t.description}</TableCell>
                    <TableCell className="text-muted-foreground">{account?.name ?? "—"}</TableCell>
                    <TableCell>
                      <CategorySelect
                        transactionId={t.id}
                        categoryId={t.category_id ?? null}
                        categories={categories ?? []}
                        action={updateTransactionCategory}
                      />
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-right font-mono",
                        Number(t.amount) < 0 ? "text-destructive" : "text-success",
                      )}
                    >
                      {formatCurrency(Number(t.amount), t.currency)}
                    </TableCell>
                    <TableCell>
                      <form action={deleteTransaction}>
                        <input type="hidden" name="id" value={t.id} />
                        <Button type="submit" variant="ghost" size="icon">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                );
              })}
              {(transactions ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                    Aucune transaction. <a href="/import" className="text-primary hover:underline">Importer un fichier →</a>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
