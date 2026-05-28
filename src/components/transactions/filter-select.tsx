"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
  color?: string;
  group?: string;
}

interface Props {
  name: string;
  defaultValue?: string;
  options: FilterOption[];
  placeholder: string;
  /** Show a search input above the options. Useful for long lists. */
  searchable?: boolean;
  /** Override the trigger's min-width. */
  minWidth?: string;
  /**
   * Submit the closest parent <form> right after a pick. Lets the user
   * pick a filter and see results immediately, without a separate click on
   * "Filtrer".
   */
  autoSubmit?: boolean;
}

/**
 * Styled drop-in replacement for `<select>` that keeps form-submit semantics.
 * Renders a hidden input synced with state so the parent form still works.
 *
 * Why not use the Radix Select?
 *   - We want one consistent look across all filters
 *   - We need a built-in search for long category lists
 *   - The Radix Select adds ~10 KB; this stays under 2
 */
export function FilterSelect({
  name,
  defaultValue = "",
  options,
  placeholder,
  searchable = false,
  minWidth = "min-w-[140px]",
  autoSubmit = false,
}: Props) {
  const router       = useRouter();
  const pathname     = usePathname();
  const searchParams = useSearchParams();

  // State holds the trigger's displayed value. Parents pass a `key` prop so
  // the component re-mounts when the URL changes (e.g. "Réinitialiser"),
  // which cleanly resets this state to the new defaultValue.
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  const buttonRef  = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  const [pos, setPos] = useState<{ left: number; top: number; width: number } | null>(null);

  const current = options.find((o) => o.value === value);

  // ── Filter on search ──────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  // ── Positioning ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const W = Math.max(rect.width, 240);
    const left = Math.max(8, Math.min(rect.left, window.innerWidth - W - 8));
    // Open ABOVE if there isn't enough room below
    const spaceBelow = window.innerHeight - rect.bottom;
    const H = 320;
    const top = spaceBelow >= H + 8 ? rect.bottom + 4 : rect.top - Math.min(H, rect.top - 8) - 4;
    setPos({ left, top, width: W });
    if (searchable) queueMicrotask(() => inputRef.current?.focus());
  }, [open, searchable]);

  // ── Click-outside ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  function pick(v: string) {
    setOpen(false);
    setQuery("");

    if (v === value) return;
    setValue(v);

    if (autoSubmit) {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (v) sp.set(name, v);
      else   sp.delete(name);
      sp.delete("page"); // reset pagination on any filter change
      const qs = sp.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(filtered.length - 1, i + 1)); return; }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(0, i - 1)); return; }
    if (e.key === "Enter")     { e.preventDefault(); const o = filtered[activeIdx]; if (o) pick(o.value); }
  }

  return (
    <>
      {/* Hidden input keeps form submission semantics for the "Filtrer" button
          (when used alongside other fields that are not auto-submitted). */}
      <input type="hidden" name={name} value={value} readOnly />

      <button
        type="button"
        ref={buttonRef}
        onClick={() => {
          setOpen((v) => !v);
          setActiveIdx(0);
          setQuery("");
        }}
        className={cn(
          "flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 text-sm text-foreground transition-all hover:border-primary/30 hover:bg-white/[0.05] focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/15",
          minWidth,
          open && "border-primary/50 bg-white/[0.05] ring-2 ring-primary/15",
        )}
      >
        {current?.color && (
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: current.color }} />
        )}
        <span className={cn("flex-1 truncate text-left", !current && "text-muted-foreground")}>
          {current ? current.label : placeholder}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-[70] flex max-h-[320px] flex-col overflow-hidden rounded-xl border border-white/[0.08] bg-zinc-950/95 shadow-2xl ring-1 ring-black/40 backdrop-blur-xl"
            style={{ left: pos.left, top: pos.top, width: pos.width }}
            onKeyDown={onKeyDown}
          >
            {searchable && (
              <div className="flex items-center gap-2 border-b border-white/[0.06] px-3 py-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
                  placeholder="Filtrer…"
                  className="h-6 w-full bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                />
              </div>
            )}

            <div className="flex-1 overflow-auto py-1">
              {filtered.map((opt, i) => {
                const isActive  = i === activeIdx;
                const isCurrent = opt.value === value;
                return (
                  <button
                    key={`${opt.value}-${i}`}
                    type="button"
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => pick(opt.value)}
                    className={cn(
                      "flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors hover:bg-white/[0.04]",
                      isActive && "bg-white/[0.05]",
                    )}
                  >
                    {opt.color !== undefined && (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: opt.color || "#52525b" }}
                      />
                    )}
                    <span className={cn("flex-1 truncate", !opt.value && "italic text-muted-foreground")}>
                      {opt.label}
                    </span>
                    {isCurrent && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Aucune correspondance.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
