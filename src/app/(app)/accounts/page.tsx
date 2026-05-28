import { redirect } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency, formatDate } from "@/lib/utils";
import { createAccount, deleteAccount } from "./actions";
import { DetectTransfersButton } from "@/components/accounts/detect-transfers-button";

export default async function AccountsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: accounts }, { count: pairedCount }, { count: unpairedCount }] = await Promise.all([
    supabase
      .from("accounts")
      .select("id, name, bank, currency, initial_balance, created_at")
      .order("created_at"),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .not("transfer_id", "is", null),
    supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .is("transfer_id", null),
  ]);

  const hasMultipleAccounts = (accounts ?? []).length >= 2;
  const pairedPairs = Math.floor((pairedCount ?? 0) / 2);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Comptes</h1>
        <p className="text-sm text-muted-foreground">
          Déclare un compte par produit bancaire que tu veux suivre.
        </p>
      </div>

      {hasMultipleAccounts && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="space-y-1">
              <p className="text-sm font-medium">Virements inter-comptes</p>
              <p className="text-xs text-muted-foreground">
                {pairedPairs > 0
                  ? `${pairedPairs} paire${pairedPairs > 1 ? "s" : ""} déjà détectée${pairedPairs > 1 ? "s" : ""}. `
                  : "Aucune paire détectée pour l'instant. "}
                Détecter ré-analyse les transactions non appairées (~{unpairedCount ?? 0}) pour
                trouver les paires manquantes — ces lignes sortent automatiquement des KPIs.
              </p>
            </div>
            <DetectTransfersButton />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ajouter un compte</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createAccount} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2">
              <Label htmlFor="name">Nom</Label>
              <Input id="name" name="name" placeholder="Compte courant" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bank">Banque</Label>
              <Input id="bank" name="bank" placeholder="BNP, Crédit Agricole…" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="currency">Devise</Label>
              <Input id="currency" name="currency" defaultValue="EUR" maxLength={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="initial_balance">Solde initial</Label>
              <Input
                id="initial_balance"
                name="initial_balance"
                type="number"
                step="0.01"
                defaultValue="0"
              />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Button type="submit">Ajouter</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tes comptes</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nom</TableHead>
                <TableHead>Banque</TableHead>
                <TableHead>Devise</TableHead>
                <TableHead className="text-right">Solde initial</TableHead>
                <TableHead>Créé le</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(accounts ?? []).map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-muted-foreground">{a.bank ?? "—"}</TableCell>
                  <TableCell>{a.currency}</TableCell>
                  <TableCell className="text-right font-mono">
                    {formatCurrency(Number(a.initial_balance), a.currency)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatDate(a.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <form action={deleteAccount}>
                      <input type="hidden" name="id" value={a.id} />
                      <Button type="submit" variant="ghost" size="icon">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </form>
                  </TableCell>
                </TableRow>
              ))}
              {(accounts ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">
                    Aucun compte. Crée-en un ci-dessus.
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
