"use client";

import { useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
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

interface PlusPos {
  x: number;
  y: number;
}

interface DialogState {
  keyword: string;
  categoryId: string;
}

// Words that are too generic to make useful keyword rules
const NOISE = new Set([
  "paiement", "pmt", "payment", "virement", "vir", "cb", "carte", "sepa",
  "de", "du", "la", "le", "les", "au", "a", "en", "par", "pour", "sur",
  "et", "ou", "avec", "the", "by", "from", "to", "in", "on", "at",
]);

function isNoise(word: string) {
  return NOISE.has(word.toLowerCase()) || /^\d+$/.test(word) || word.length < 2;
}

export function DescriptionRuleCreator({ description, categories }: Props) {
  const leaveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const [hoveredWord, setHoveredWord] = useState<string | null>(null);
  const [plusPos,     setPlusPos]     = useState<PlusPos>({ x: 0, y: 0 });
  const [dialog,      setDialog]      = useState<DialogState | null>(null);
  const [isPending,   startTransition] = useTransition();
  const [saved,       setSaved]       = useState(false);

  const words = description.split(/\s+/).filter(Boolean);

  // ── Word hover handlers ──────────────────────────────────────────────────
  function onWordEnter(word: string, e: React.MouseEvent<HTMLSpanElement>) {
    clearTimeout(leaveTimer.current);
    const rect = e.currentTarget.getBoundingClientRect();
    setHoveredWord(word);
    setPlusPos({ x: rect.right + 4, y: rect.top - 6 });
  }

  function onWordLeave() {
    // Small delay so the cursor can move to the "+" button without it disappearing
    leaveTimer.current = setTimeout(() => setHoveredWord(null), 120);
  }

  function onPlusEnter() {
    clearTimeout(leaveTimer.current);
  }

  function onPlusLeave() {
    leaveTimer.current = setTimeout(() => setHoveredWord(null), 120);
  }

  // ── Dialog ───────────────────────────────────────────────────────────────
  function openDialog(word: string) {
    setHoveredWord(null);
    setSaved(false);
    setDialog({
      keyword: word,
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
      {/* ── Description with hoverable words ──────────────────────────── */}
      <div
        className="flex max-w-[280px] items-center overflow-hidden"
        style={{ whiteSpace: "nowrap" }}
      >
        {words.map((word, i) => (
          <span key={i} className="contents">
            <span
              onMouseEnter={(e) => onWordEnter(word, e)}
              onMouseLeave={onWordLeave}
              className={cn(
                "shrink-0 rounded-sm px-px font-medium transition-colors",
                !dialog && hoveredWord === word
                  ? isNoise(word)
                    ? "bg-muted text-muted-foreground"
                    : "bg-primary/15 text-primary cursor-pointer"
                  : "",
              )}
            >
              {word}
            </span>
            {i < words.length - 1 && (
              <span className="shrink-0 select-none">&nbsp;</span>
            )}
          </span>
        ))}
      </div>

      {/* ── "+" button rendered in document.body (escapes overflow:hidden) ─ */}
      {hoveredWord && !dialog && typeof document !== "undefined" &&
        createPortal(
          <button
            onMouseEnter={onPlusEnter}
            onMouseLeave={onPlusLeave}
            onMouseDown={(e) => {
              e.preventDefault();
              openDialog(hoveredWord);
            }}
            className="fixed z-[9999] flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white shadow-lg transition-transform hover:scale-110"
            style={{ left: plusPos.x, top: plusPos.y, lineHeight: 1 }}
            title={`Créer une règle sur "${hoveredWord}"`}
          >
            +
          </button>,
          document.body,
        )}

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
              {/* Header */}
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
                  S'appliquera aux transactions non catégorisées existantes.
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
