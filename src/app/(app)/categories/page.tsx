import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  addRule,
  createCategory,
  deleteRule,
  seedDefaultCategories,
  seedDefaultRules,
} from "./actions";
import { CategoryRow } from "@/components/categories/category-row";

export default async function CategoriesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: categories }, { data: rules }] = await Promise.all([
    supabase.from("categories").select("id, name, color, kind").order("kind").order("name"),
    supabase
      .from("rules")
      .select("id, pattern, category_id, priority, categories(name, color)")
      .order("priority"),
  ]);

  const cats = categories ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Catégories & règles</h1>
        <p className="text-sm text-muted-foreground">
          Tes catégories te sont propres. Tu peux créer, modifier ou supprimer chacune d'elles.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle>Catégories</CardTitle>
                <CardDescription>{cats.length} au total</CardDescription>
              </div>
              {cats.length === 0 && (
                <form action={seedDefaultCategories}>
                  <Button type="submit" size="sm" variant="outline">
                    Charger les 15 catégories par défaut
                  </Button>
                </form>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={createCategory} className="grid grid-cols-[1fr_auto_auto_auto] gap-2">
              <Input name="name" placeholder="Nom de la catégorie" required />
              <select
                name="kind"
                defaultValue="expense"
                className="h-10 rounded-md border border-input bg-secondary px-3 text-sm"
              >
                <option value="expense">Dépense</option>
                <option value="income">Revenu</option>
                <option value="transfer">Transfert</option>
              </select>
              <input
                type="color"
                name="color"
                defaultValue="#94a3b8"
                className="h-10 w-12 rounded-md border border-input"
              />
              <Button type="submit" size="sm">
                Ajouter
              </Button>
            </form>

            <div className="space-y-1">
              {cats.map((c) => (
                <CategoryRow key={c.id} category={c} />
              ))}
              {cats.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Aucune catégorie. Clique « Charger les 15 catégories par défaut » ci-dessus, ou
                  crée la tienne.
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <CardTitle>Règles de catégorisation</CardTitle>
                <CardDescription>
                  {(rules ?? []).length} règles actives — appliquées automatiquement à chaque import
                </CardDescription>
              </div>
              {(rules ?? []).length === 0 && cats.length > 0 && (
                <form action={seedDefaultRules}>
                  <Button type="submit" size="sm" variant="outline">
                    Charger les règles par défaut
                  </Button>
                </form>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form action={addRule} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input name="pattern" placeholder="Mot-clé (ex: carrefour)" required />
              <select
                name="category_id"
                required
                className="h-10 rounded-md border border-input bg-secondary px-3 text-sm"
              >
                <option value="">— catégorie —</option>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm">
                Ajouter
              </Button>
            </form>

            <div className="max-h-96 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Mot-clé</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(rules ?? []).map((r) => {
                    const cat = r.categories as unknown as { name: string; color: string } | null;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.pattern}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: cat?.color ?? "#94a3b8" }}
                            />
                            {cat?.name ?? "?"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <form action={deleteRule}>
                            <input type="hidden" name="id" value={r.id} />
                            <Button type="submit" variant="ghost" size="icon">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {(rules ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                        Aucune règle. La catégorisation IA via OpenRouter prendra le relais sur les
                        transactions sans correspondance.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
