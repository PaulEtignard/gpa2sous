import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { ImportFlow } from "@/components/import/import-flow";

export default async function ImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: accounts }, { data: categories }] = await Promise.all([
    supabase.from("accounts").select("id, name, bank, currency").order("created_at"),
    supabase.from("categories").select("id, name, color, kind").order("name"),
  ]);

  if (!accounts || accounts.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-4 p-12 text-center">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CreditCard className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Aucun compte bancaire</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Crée d'abord un compte (compte courant, livret…) pour y rattacher tes imports.
            </p>
          </div>
          <Link href="/accounts">
            <Button>Créer un compte</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Importer un relevé</h1>
        <p className="text-sm text-muted-foreground">
          Dépose le fichier CSV exporté depuis ta banque. Le parser détecte automatiquement le
          format, tu peux vérifier le mapping avant de valider.
        </p>
      </div>
      <ImportFlow accounts={accounts} categories={categories ?? []} />
    </div>
  );
}
