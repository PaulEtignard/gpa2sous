"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Wand2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { addRuleDirect } from "@/app/(app)/categories/actions";

interface Category {
  id: string;
  name: string;
  color: string;
}

interface Props {
  description: string;
  categories: Category[];
}

interface DialogState {
  keyword: string;
  categoryId: string;
}

// Words that are too generic to make useful keyword rules
const NOISE = new Set([
  "paiement", "pmt", "payment", "virement", "vir", "cb", "carte", "sepa",
  "prlv", "psc", "inst", "instant", "fact", "ref",
  "de", "du", "la", "le", "les", "au", "a", "en", "par", "pour", "sur",
  "et", "ou", "avec", "the", "by", "from", "to", "in", "on", "at",
  "fr", "eur", "euro", "usd",
]);

function isNoise(word: string) {
  return NOISE.has(word.toLowerCase()) || /^\d+$/.test(word) || word.length < 2;
}

/** Pick the most meaningful word for the default keyword suggestion. */
function defaultKeyword(words: string[]): string {
  // Prefer the longest non-noise word — usually the merchant name.
  const candidates = words.filter((w) => !isNoise(w));
  if (candidates.length === 0) return words[0] ?? "";
  return [...candidates].sort((a, b) => b.length - a.length)[0];
}

export function DescriptionRuleCreator({ description, categories }: Props) {
  const [dialog, setDialog]   = useState<DialogState | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved]     = useState(false);

  // Collapse multi-line bank descriptions ("PAIEMENT PAR CARTE\nX1234 …")
  // into a single readable line so the row stays compact.
  const cleanDescription = description.replace(/\s+/g, " ").trim();
  const words = cleanDescription.split(" ").filter(Boolean);

  function openDialog() {
    setSaved(false);
    setDialog({
      keyword: defaultKeyword(words),
      categoryId: categories[0]?.id ?? "",
    });
  }

  function closeDialog() {
    setDialog(null);
    setSaved(false);
  }

  function handleSubmit() {
    if (!dialog?.keyword.trim() || !dialog?.categoryId) return;
    startTransition(async () => {
      await addRuleDirect(dialog.keyword.trim(), dialog.categoryId);
      setSaved(true);
      setTimeout(closeDialog, 1000);
    });
  }

  return (
    <>
      {/* ── Description + magic-wand action ───────────────────────────── */}
      <div className="group/desc flex min-w-0 items-start gap-2">
        <span
          className="min-w-0 flex-1 break-words text-sm font-medium leading-snug"
          title={cleanDescription}
        >
          {cleanDescription}
        </span>
        <button
          type="button"
          onClick={openDialog}
          title="Créer une règle à partir d'un mot"
          aria-label="Créer une règle à partir d'un mot"
          className="mt-0.5 inline-flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-zinc-600 opacity-0 transition-all hover:bg-primary/15 hover:text-primary group-hover/desc:opacity-100 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        >
          <Wand2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* ── Rule creation dialog ───────────────────────────────────────── */}
      {dialog && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={closeDialog}
          >
            <div
              className="mx-4 w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-5">
                <h3 className="text-base font-semibold">Créer une règle</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Toutes les transactions contenant ce mot-clé seront catégorisées automatiquement.
                </p>
              </div>

              {/* Word chips — click to change keyword */}
              <div className="mb-4">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Mots de la description
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {words.map((word, i) => {
                    const isSelected = dialog.keyword === word;
                    const noise      = isNoise(word);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setDialog((d) => d ? { ...d, keyword: word } : d)}
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                          isSelected
                            ? "bg-primary text-primary-foreground"
                            : noise
                            ? "bg-muted/40 text-muted-foreground/50 cursor-default"
                            : "bg-secondary text-foreground hover:bg-secondary/70",
                        )}
                        disabled={noise}
                        title={noise ? "Mot trop générique" : undefined}
                      >
                        {word}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Keyword input */}
              <div className="mb-4 space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Mot-clé (modifiable)
                </label>
                <input
                  value={dialog.keyword}
                  onChange={(e) =>
                    setDialog((d) => d ? { ...d, keyword: e.target.value } : d)
                  }
                  placeholder="Ex : Intermarché"
                  className="h-9 w-full rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  autoFocus
                />
              </div>

              {/* Category picker */}
              <div className="mb-6 space-y-1.5">
                <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Catégorie
                </label>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        categories.find((c) => c.id === dialog.categoryId)?.color ?? "#94a3b8",
                    }}
                  />
                  <select
                    value={dialog.categoryId}
                    onChange={(e) =>
                      setDialog((d) => d ? { ...d, categoryId: e.target.value } : d)
                    }
                    className="h-9 flex-1 rounded-lg border border-input bg-secondary px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-muted-foreground">
                  S&apos;appliquera aux transactions non catégorisées existantes.
                </p>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={closeDialog}
                    disabled={isPending}
                    className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={isPending || !dialog.keyword.trim() || !dialog.categoryId || saved}
                    className={cn(
                      "rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
                      saved
                        ? "bg-primary/20 text-primary"
                        : "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50",
                    )}
                  >
                    {saved ? "✓ Règle créée !" : isPending ? "Création…" : "Créer la règle"}
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
