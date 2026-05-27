"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, FileText, Loader2, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { parseCSVFile, normalizeRows } from "@/lib/csv/parser";
import { parsePDFFile, type PdfParseResult } from "@/lib/pdf/parser";
import { findMatchingCategoryId, type Rule } from "@/lib/categorize";
import type {
  AmountMode,
  ColumnMapping,
  DateFormat,
  NormalizedTransaction,
  ParsedTable,
} from "@/lib/csv/types";
import { createClient } from "@/lib/supabase/client";
import { cn, formatCurrency } from "@/lib/utils";

type AccountOpt = { id: string; name: string; bank: string | null; currency: string };
type CategoryOpt = { id: string; name: string; color: string; kind: string };

type Step = "upload" | "preview" | "done";

type ParsedSource =
  | { kind: "csv"; table: ParsedTable }
  | { kind: "pdf"; result: PdfParseResult };

export function ImportFlow({
  accounts,
  categories,
}: {
  accounts: AccountOpt[];
  categories: CategoryOpt[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("upload");
  const [file, setFile] = useState<File | null>(null);
  const [source, setSource] = useState<ParsedSource | null>(null);
  const [accountId, setAccountId] = useState<string>(accounts[0]?.id ?? "");
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [dateFormat, setDateFormat] = useState<DateFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{ inserted: number; duplicates: number; errors: number } | null>(null);

  async function onFile(f: File) {
    setError(null);
    setFile(f);
    setParsing(true);
    try {
      const isPDF = /\.pdf$/i.test(f.name) || f.type === "application/pdf";
      if (isPDF) {
        const result = await parsePDFFile(f);
        if (result.transactions.length === 0) {
          setError(result.diagnostic.errors[0] ?? "Aucune transaction détectée dans ce PDF.");
          setParsing(false);
          return;
        }
        setSource({ kind: "pdf", result });
      } else {
        const parsed = await parseCSVFile(f);
        if (parsed.rows.length === 0) {
          setError("Aucune transaction détectée dans le fichier.");
          setParsing(false);
          return;
        }
        setSource({ kind: "csv", table: parsed });
        setMapping(parsed.mapping);
        setDateFormat(parsed.format.dateFormat);
      }
      setStep("preview");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de lecture du fichier.");
    } finally {
      setParsing(false);
    }
  }

  function getTransactions(): NormalizedTransaction[] {
    if (!source) return [];
    if (source.kind === "pdf") return source.result.transactions;
    if (!mapping || !dateFormat) return [];
    const tableForNormalize = { ...source.table, format: { ...source.table.format, dateFormat } };
    return normalizeRows(tableForNormalize, mapping).transactions;
  }

  async function confirmImport() {
    if (!source || !accountId || !file) return;
    setImporting(true);
    setError(null);

    const transactions = getTransactions();
    if (transactions.length === 0) {
      setError("Aucune transaction valide à importer.");
      setImporting(false);
      return;
    }

    const supabase = createClient();
    const { data: rulesData } = await supabase
      .from("rules")
      .select("id, pattern, category_id, priority");
    const rules: Rule[] = (rulesData as Rule[]) ?? [];

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError("Session expirée.");
      setImporting(false);
      return;
    }

    const account = accounts.find((a) => a.id === accountId)!;

    // Build stable external_ids with a per-group counter, so that:
    //   - 3 × identical "PRLV PAYPAL 5,00€" on the same day keep separate IDs
    //   - re-importing the same file produces the same IDs → deduplication works
    //   - importing overlapping files only inserts the truly new lines
    const groupCounter = new Map<string, number>();
    const rows = transactions.map((t) => {
      const slug = t.rawLabel
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .slice(0, 40);
      const base = `${t.bookedAt}|${t.amount.toFixed(2)}|${slug}`;
      const occurrence = (groupCounter.get(base) ?? 0) + 1;
      groupCounter.set(base, occurrence);
      return {
        user_id: user.id,
        account_id: accountId,
        category_id: findMatchingCategoryId(t.description, rules),
        booked_at: t.bookedAt,
        description: t.description,
        amount: t.amount,
        currency: account.currency,
        raw_label: t.rawLabel,
        source: "csv" as const,
        external_id: `${base}|${occurrence}`,
      };
    });

    console.log("[Gpadesous] Inserting", rows.length, "transactions", { sample: rows[0] });

    const { data: inserted, error: insertError } = await supabase
      .from("transactions")
      .upsert(rows, {
        onConflict: "user_id,account_id,external_id",
        ignoreDuplicates: true,
      })
      .select("id");

    if (insertError) {
      console.error("[Gpadesous] Insert failed:", insertError);
      setError(
        `Erreur d'insertion (${insertError.code ?? "?"}): ${insertError.message}\n` +
          `Détail: ${insertError.details ?? "—"}\n` +
          `Astuce: ${insertError.hint ?? "Vérifie que supabase/schema.sql a bien été appliqué dans le SQL Editor."}`,
      );
      setImporting(false);
      return;
    }

    const insertedCount = inserted?.length ?? 0;
    const duplicates = rows.length - insertedCount;
    console.log("[Gpadesous] Inserted", insertedCount, "/ duplicates", duplicates);

    if (insertedCount === 0 && duplicates === rows.length) {
      setError(
        `Aucune transaction insérée — toutes (${rows.length}) ont été détectées comme doublons d'un import précédent. ` +
          `Va sur /transactions pour les voir.`,
      );
      setImporting(false);
      return;
    }

    await supabase.from("import_batches").insert({
      user_id: user.id,
      account_id: accountId,
      filename: file.name,
      row_count: transactions.length,
      inserted_count: insertedCount,
      duplicate_count: duplicates,
    });

    setResult({ inserted: insertedCount, duplicates, errors: 0 });
    setStep("done");
    setImporting(false);
    router.refresh();
  }

  function reset() {
    setStep("upload");
    setFile(null);
    setSource(null);
    setMapping(null);
    setDateFormat(null);
    setResult(null);
    setError(null);
  }

  if (step === "upload") {
    return (
      <UploadStep
        onFile={onFile}
        error={error}
        parsing={parsing}
        accounts={accounts}
        accountId={accountId}
        setAccountId={setAccountId}
      />
    );
  }

  if (step === "done" && result) {
    return <DoneStep result={result} onReset={reset} />;
  }

  if (!source) return null;

  if (source.kind === "pdf") {
    return (
      <PdfPreviewStep
        result={source.result}
        onBack={reset}
        onConfirm={confirmImport}
        importing={importing}
        error={error}
      />
    );
  }

  if (!mapping || !dateFormat) return null;
  return (
    <CsvPreviewStep
      table={source.table}
      mapping={mapping}
      setMapping={setMapping}
      dateFormat={dateFormat}
      setDateFormat={setDateFormat}
      categories={categories}
      onBack={reset}
      onConfirm={confirmImport}
      importing={importing}
      error={error}
    />
  );
}

function UploadStep({
  onFile,
  error,
  parsing,
  accounts,
  accountId,
  setAccountId,
}: {
  onFile: (f: File) => void;
  error: string | null;
  parsing: boolean;
  accounts: AccountOpt[];
  accountId: string;
  setAccountId: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Choisis le compte</CardTitle>
        <CardDescription>Sur quel compte importes-tu ces transactions ?</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Compte</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                  {a.bank ? ` — ${a.bank}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Fichier</Label>
          <label
            htmlFor="bank-file"
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f && !parsing) onFile(f);
            }}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 px-6 py-12 text-center transition-colors hover:bg-muted/50",
              dragOver && "border-primary bg-primary/5",
              parsing && "pointer-events-none opacity-60",
            )}
          >
            {parsing ? (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <div className="font-medium">Analyse du fichier…</div>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <div className="font-medium">Dépose ton fichier ici</div>
                <div className="text-sm text-muted-foreground">ou clique pour choisir un fichier</div>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <Badge variant="outline" className="gap-1.5">
                    <FileSpreadsheet className="h-3 w-3" /> CSV / TSV
                  </Badge>
                  <Badge variant="outline" className="gap-1.5">
                    <FileText className="h-3 w-3" /> PDF
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  Toutes banques — encodage, séparateur, dates et montants détectés automatiquement
                </div>
              </>
            )}
          </label>
          <input
            id="bank-file"
            type="file"
            accept=".csv,.tsv,.txt,.pdf,text/csv,text/plain,application/pdf"
            className="sr-only"
            disabled={parsing}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </div>

        {error && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        )}
      </CardContent>
    </Card>
  );
}

function PdfPreviewStep({
  result,
  onBack,
  onConfirm,
  importing,
  error,
}: {
  result: PdfParseResult;
  onBack: () => void;
  onConfirm: () => void;
  importing: boolean;
  error: string | null;
}) {
  const { transactions, diagnostic } = result;
  const income = transactions.filter((t) => t.amount > 0).length;
  const expense = transactions.filter((t) => t.amount < 0).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>2. Vérifie l'extraction</CardTitle>
          <CardDescription>
            {diagnostic.bank ? `Banque détectée : ${diagnostic.bank}. ` : ""}
            {diagnostic.pages} page{diagnostic.pages > 1 ? "s" : ""}, {diagnostic.lines} lignes scannées.
            {!diagnostic.columnsDetected && (
              <span className="ml-1 text-amber-600">
                Colonnes Débit/Crédit non détectées — les revenus pourraient être mal identifiés.
              </span>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="success">{transactions.length} transactions</Badge>
            <Badge variant="secondary">
              {expense} dépense{expense > 1 ? "s" : ""}
            </Badge>
            <Badge variant="secondary">
              {income} revenu{income > 1 ? "s" : ""}
            </Badge>
            {diagnostic.columnsDetected && <Badge variant="outline">Débit/Crédit par position</Badge>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Aperçu</CardTitle>
          <CardDescription>10 premières transactions extraites</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.slice(0, 10).map((t, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{t.bookedAt}</TableCell>
                  <TableCell className="max-w-md truncate">{t.description}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      t.amount < 0 ? "text-destructive" : "text-success",
                    )}
                  >
                    {formatCurrency(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <div className="text-sm font-semibold text-destructive">Erreur</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-destructive">{error}</pre>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={importing}>
          Retour
        </Button>
        <Button onClick={onConfirm} disabled={importing || transactions.length === 0}>
          {importing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Import…
            </>
          ) : (
            `Importer ${transactions.length} transaction${transactions.length > 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </div>
  );
}

function CsvPreviewStep({
  table,
  mapping,
  setMapping,
  dateFormat,
  setDateFormat,
  categories: _categories,
  onBack,
  onConfirm,
  importing,
  error,
}: {
  table: ParsedTable;
  mapping: ColumnMapping;
  setMapping: (m: ColumnMapping) => void;
  dateFormat: DateFormat;
  setDateFormat: (f: DateFormat) => void;
  categories: CategoryOpt[];
  onBack: () => void;
  onConfirm: () => void;
  importing: boolean;
  error: string | null;
}) {
  const colCount = Math.max(table.headers.length, ...table.rows.map((r) => r.length));
  const columns = Array.from({ length: colCount }, (_, i) =>
    table.headers[i] && table.headers[i].length > 0 ? table.headers[i] : `Colonne ${i + 1}`,
  );

  const preview = normalizeRows({ ...table, format: { ...table.format, dateFormat } }, mapping);
  const validCount = preview.transactions.length;
  const errorCount = preview.errors.length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>2. Vérifie le mapping</CardTitle>
          <CardDescription>
            Format détecté : séparateur <code className="rounded bg-muted px-1">{display(table.format.delimiter)}</code>,
            encodage <code className="rounded bg-muted px-1">{table.format.encoding}</code>,
            décimal <code className="rounded bg-muted px-1">{table.format.decimalSeparator}</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <ColumnSelect
              label="Colonne date"
              value={mapping.dateColumn}
              columns={columns}
              onChange={(v) => setMapping({ ...mapping, dateColumn: v })}
            />
            <ColumnSelect
              label="Colonne description"
              value={mapping.descriptionColumn}
              columns={columns}
              onChange={(v) => setMapping({ ...mapping, descriptionColumn: v })}
            />
            <div className="space-y-2">
              <Label>Mode montant</Label>
              <Select
                value={mapping.amount.kind}
                onValueChange={(kind) => {
                  if (kind === "signed") {
                    setMapping({ ...mapping, amount: { kind: "signed", column: 0 } });
                  } else {
                    setMapping({ ...mapping, amount: { kind: "debit_credit", debitColumn: 0, creditColumn: 1 } });
                  }
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="signed">Une colonne signée</SelectItem>
                  <SelectItem value="debit_credit">Débit/Crédit séparés</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Format date</Label>
              <Select value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DD/MM/YYYY">JJ/MM/AAAA</SelectItem>
                  <SelectItem value="DD-MM-YYYY">JJ-MM-AAAA</SelectItem>
                  <SelectItem value="DD.MM.YYYY">JJ.MM.AAAA</SelectItem>
                  <SelectItem value="MM/DD/YYYY">MM/JJ/AAAA (US)</SelectItem>
                  <SelectItem value="YYYY-MM-DD">AAAA-MM-JJ (ISO)</SelectItem>
                  <SelectItem value="YYYY/MM/DD">AAAA/MM/JJ</SelectItem>
                  <SelectItem value="DD/MM/YY">JJ/MM/AA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {mapping.amount.kind === "signed" ? (
              <ColumnSelect
                label="Colonne montant"
                value={mapping.amount.column}
                columns={columns}
                onChange={(v) =>
                  setMapping({ ...mapping, amount: { kind: "signed", column: v } as AmountMode })
                }
              />
            ) : (
              <>
                <ColumnSelect
                  label="Colonne débit"
                  value={mapping.amount.debitColumn}
                  columns={columns}
                  onChange={(v) =>
                    setMapping({
                      ...mapping,
                      amount: { ...mapping.amount, debitColumn: v } as AmountMode,
                    })
                  }
                />
                <ColumnSelect
                  label="Colonne crédit"
                  value={mapping.amount.creditColumn}
                  columns={columns}
                  onChange={(v) =>
                    setMapping({
                      ...mapping,
                      amount: { ...mapping.amount, creditColumn: v } as AmountMode,
                    })
                  }
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Badge variant="success">{validCount} valides</Badge>
            {errorCount > 0 && <Badge variant="destructive">{errorCount} en erreur</Badge>}
            <Badge variant="secondary">{table.rows.length} lignes au total</Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>3. Aperçu</CardTitle>
          <CardDescription>5 premières lignes après normalisation</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Montant</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.transactions.slice(0, 5).map((t, i) => (
                <TableRow key={i}>
                  <TableCell className="font-mono text-xs">{t.bookedAt}</TableCell>
                  <TableCell className="max-w-xs truncate">{t.description}</TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      t.amount < 0 ? "text-destructive" : "text-success",
                    )}
                  >
                    {formatCurrency(t.amount)}
                  </TableCell>
                </TableRow>
              ))}
              {preview.transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">
                    Aucune ligne valide avec ce mapping. Ajuste les colonnes.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4">
          <div className="text-sm font-semibold text-destructive">Erreur</div>
          <pre className="mt-1 whitespace-pre-wrap break-words text-sm text-destructive">{error}</pre>
        </div>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={importing}>
          Retour
        </Button>
        <Button onClick={onConfirm} disabled={importing || validCount === 0}>
          {importing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Import…
            </>
          ) : (
            `Importer ${validCount} transaction${validCount > 1 ? "s" : ""}`
          )}
        </Button>
      </div>
    </div>
  );
}

function ColumnSelect({
  label,
  value,
  columns,
  onChange,
}: {
  label: string;
  value: number;
  columns: string[];
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {columns.map((c, i) => (
            <SelectItem key={i} value={String(i)}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function DoneStep({
  result,
  onReset,
}: {
  result: { inserted: number; duplicates: number; errors: number };
  onReset: () => void;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
        <CheckCircle2 className="h-12 w-12 text-success" />
        <div>
          <h2 className="text-xl font-semibold">Import terminé</h2>
          <p className="mt-1 text-sm text-muted-foreground">Tes transactions sont disponibles dans le dashboard.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Badge variant="success">{result.inserted} importées</Badge>
          {result.duplicates > 0 && <Badge variant="secondary">{result.duplicates} doublons ignorés</Badge>}
          {result.errors > 0 && (
            <Badge variant="destructive">
              <XCircle className="mr-1 h-3 w-3" /> {result.errors} en erreur
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-3 pt-4">
          <Button variant="outline" onClick={onReset}>
            Importer un autre fichier
          </Button>
          <a href="/transactions">
            <Button variant="outline">Voir les transactions</Button>
          </a>
          <a href="/dashboard">
            <Button>Voir le dashboard</Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

function display(d: string): string {
  if (d === "\t") return "tab";
  return d;
}

