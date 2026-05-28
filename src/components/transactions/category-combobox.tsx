"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  setCategoryDirect,
  findSimilarMerchants,
  bulkCategorizeByMerchant,
} from "@/app/(app)/transactions/actions";
import type { CategorizationSource } from "@/types/database";

interface Category {
  id: string;
  name: string;
  color: string;
  kind?: "income" | "expense" | "transfer";
}

interface DialogState {
  keyword: string;
  count: number;
  newCategoryId: string;
  newCategoryName: string;
}

interface Props {
  transactionId: string;
  description: string;
  categoryId: string | null;
  source: CategorizationSource;
  isTransfer: boolean;
  categories: Category[];
}

const SOURCE_LABEL: Record<NonNullable<CategorizationSource>, string> = {
  manual: "Manuel",
  rule: "Règle",
  ai: "IA",
};

const SOURCE_BADGE: Record<NonNullable<CategorizationSource>, string> = {
  manual: "M",
  rule: "R",
  ai: "IA",
};

const SOURCE_STYLE: Record<NonNullable<CategorizationSource>, string> = {
  manual: "text-emerald-300 ring-emerald-400/30 bg-emerald-400/10",
  rule:   "text-sky-300    ring-sky-400/30    bg-sky-400/10",
  ai:     "text-violet-300 ring-violet-400/30 bg-violet-400/10",
};

export function CategoryCombobox({
  transactionId,
  description,
  categoryId,
  source,
  isTransfer,
  categories,
}: Props) {
  const [currentId, setCurrentId] = useState(categoryId);
  const [currentSource, setCurrentSource] = useState<CategorizationSource>(source);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const current = useMemo(
    () => categories.find((c) => c.id === currentId) ?? null,
    [categories, currentId],
  );

  // ── Filter ─────────────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return categories;
    return categories.filter((c) => c.name.toLowerCase().includes(q));
  }, [categories, query]);

  // ── Positioning ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const POPOVER_W = 260;
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - POPOVER_W - 8));
    setPos({ left, top: rect.bottom + 4, width: POPOVER_W });
    // Focus input on open
    queueMicrotask(() => inputRef.current?.focus());
  }, [open]);

  // ── Click-outside ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (
        buttonRef.current?.contains(t) ||
        popoverRef.current?.contains(t)
      ) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // ── Apply ──────────────────────────────────────────────────────────────────
  function applyCategory(newId: string | null) {
    const cat = newId ? categories.find((c) => c.id === newId) : null;
    setCurrentId(newId);
    setCurrentSource(newId ? "manual" : null);
    setOpen(false);
    setQuery("");

    startTransition(async () => {
      await setCategoryDirect(transactionId, newId, "manual");

      // Offer bulk-apply when a real category is set and there are similar merchants
      if (newId && cat) {
        try {
          const { keyword, count } = await findSimilarMerchants(
            transactionId,
            description,
            newId,
          );
          if (count > 0 && keyword) {
            setDialog({
              keyword,
              count,
              newCategoryId: newId,
              newCategoryName: cat.name,
            });
          }
        } catch (e) {
          console.warn(e);
        }
      }
    });
  }

  function handleConfirm() {
    if (!dialog) return;
    const { keyword, newCategoryId } = dialog;
    setDialog(null);
    startTransition(async () => {
      await bulkCategorizeByMerchant(keyword, newCategoryId);
    });
  }

  // ── Keyboard navigation ────────────────────────────────────────────────────
  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx === 0 && !query.trim()) {
        applyCategory(null);
      } else {
        const idx = query.trim() ? activeIdx : activeIdx - 1;
        const pick = filtered[idx];
        if (pick) applyCategory(pick.id);
      }
    }
  }

  const swatchColor = current?.color ?? "#3f3f46";

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setActiveIdx(0);
          setQuery("");
        }}
        disabled={isPending && !open}
        className={cn(
          "group flex h-8 min-w-[160px] max-w-[220px] cursor-pointer items-center gap-2 rounded-lg border border-white/[0.07] bg-white/[0.03] px-2.5 text-xs transition-colors hover:border-primary/30 hover:bg-white/[0.05] focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15 disabled:cursor-not-allowed disabled:opacity-50",
          open && "border-primary/50 bg-white/[0.05] ring-2 ring-primary/15",
        )}
      >
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: swatchColor }}
        />
        <span className="flex-1 truncate text-left">
          {current ? current.name : <span className="text-muted-foreground">Non catégorisé</span>}
        </span>
        {currentSource && !isTransfer && (
          <span
            title={SOURCE_LABEL[currentSource]}
            className={cn(
              "shrink-0 rounded px-1 py-0 text-[9px] font-bold uppercase tracking-wider ring-1",
              SOURCE_STYLE[currentSource],
            )}
          >
            {SOURCE_BADGE[currentSource]}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3 w-3 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {/* ── Popover ─────────────────────────────────────────────────────── */}
      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[60] flex flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/95 shadow-2xl ring-1 ring-black/40 backdrop-blur-xl"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
            onKeyDown={onKeyDown}
          >
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setActiveIdx(0);
                }}
                placeholder="Filtrer…"
                className="h-6 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
              />
            </div>

            {/* Reset option (always at top, no query) */}
            <div className="max-h-[280px] overflow-auto py-1">
              {!query.trim() && (
                <button
                  type="button"
                  onMouseEnter={() => setActiveIdx(0)}
                  onClick={() => applyCategory(null)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-white/[0.04]",
                    activeIdx === 0 && "bg-white/[0.05] text-foreground",
                  )}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-zinc-700" />
                  <span className="flex-1 truncate italic">Non catégorisé</span>
                  {currentId === null && <Check className="h-3 w-3 shrink-0 text-primary" />}
                </button>
              )}

              {/* Filtered list */}
              {filtered.map((c, i) => {
                const realIdx = query.trim() ? i : i + 1;
                const isActive = realIdx === activeIdx;
                const isCurrent = c.id === currentId;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onMouseEnter={() => setActiveIdx(realIdx)}
                    onClick={() => applyCategory(c.id)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-white/[0.04]",
                      isActive && "bg-white/[0.05]",
                    )}
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: c.color }}
                    />
                    <span className="flex-1 truncate">{c.name}</span>
                    {isCurrent && <Check className="h-3 w-3 shrink-0 text-primary" />}
                  </button>
                );
              })}

              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Aucune catégorie ne correspond.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}

      {/* ── Bulk-apply dialog ──────────────────────────────────────────── */}
      {dialog && typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setDialog(null)}
          >
            <div
              className="mx-4 w-full max-w-sm rounded-2xl border border-white/[0.08] bg-zinc-950/95 p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="mb-1.5 text-base font-semibold">
                Catégorisation groupée
              </h3>
              <p className="mb-5 text-sm text-zinc-400 leading-relaxed">
                {dialog.count} autre{dialog.count > 1 ? "s" : ""} transaction
                {dialog.count > 1 ? "s" : ""} contenant{" "}
                <span className="font-medium text-foreground">&laquo;&nbsp;{dialog.keyword}&nbsp;&raquo;</span>{" "}
                {dialog.count > 1 ? "ne sont" : "n'est"} pas dans cette catégorie.
                Les catégoriser en{" "}
                <span className="font-medium text-foreground">{dialog.newCategoryName}</span>
                &nbsp;?
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDialog(null)}
                  className="cursor-pointer rounded-lg px-3 py-2 text-sm text-zinc-400 transition-colors hover:bg-white/[0.04] hover:text-zinc-100"
                >
                  Non, juste celle-ci
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="cursor-pointer rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-all hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(59,130,246,0.28)]"
                >
                  Oui, toutes ({dialog.count})
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
