"use client";

import { useState } from "react";
import Image from "next/image";
import { Pencil, Plus, Trash2, X } from "lucide-react";
import {
  addAlias,
  createMerchant,
  deleteAlias,
  deleteMerchant,
  updateMerchant,
} from "@/app/(app)/admin/actions";

export interface MerchantWithAliases {
  id: string;
  display_name: string;
  domain: string | null;
  logo_url: string | null;
  source: string;
  merchant_aliases: { id: string; pattern: string }[];
}

const inputCls =
  "h-9 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/15";

export function MerchantsManager({ merchants }: { merchants: MerchantWithAliases[] }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = merchants.filter((m) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      m.display_name.toLowerCase().includes(q) ||
      (m.domain ?? "").toLowerCase().includes(q) ||
      m.merchant_aliases.some((a) => a.pattern.includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Create */}
      <form
        action={createMerchant}
        className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-5"
      >
        <p className="mb-3 text-sm font-semibold">Ajouter un commerçant</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input name="display_name" placeholder="Nom (ex : PayPal)" required className={inputCls} />
          <input name="domain" placeholder="Domaine (ex : paypal.com)" className={inputCls} />
          <input name="logo_url" placeholder="URL logo (optionnel)" className={inputCls} />
          <input name="alias" placeholder="Alias initial (ex : paypal)" className={inputCls} />
        </div>
        <div className="mt-3 flex justify-end">
          <button
            type="submit"
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>
      </form>

      {/* Search */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Rechercher un commerçant ou un alias…"
        className={inputCls}
      />

      {/* List */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <p className="py-8 text-center text-sm text-muted-foreground">Aucun commerçant.</p>
        )}
        {filtered.map((m) => (
          <div key={m.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
            {editing === m.id ? (
              <form
                action={updateMerchant}
                onSubmit={() => setEditing(null)}
                className="grid grid-cols-1 gap-3 sm:grid-cols-3"
              >
                <input type="hidden" name="id" value={m.id} />
                <input name="display_name" defaultValue={m.display_name} required className={inputCls} />
                <input name="domain" defaultValue={m.domain ?? ""} placeholder="domaine" className={inputCls} />
                <input name="logo_url" defaultValue={m.logo_url ?? ""} placeholder="URL logo" className={inputCls} />
                <div className="flex gap-2 sm:col-span-3">
                  <button
                    type="submit"
                    className="h-9 cursor-pointer rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="h-9 cursor-pointer rounded-lg px-4 text-sm text-muted-foreground hover:bg-white/[0.05]"
                  >
                    Annuler
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  {m.logo_url ? (
                    <Image
                      src={m.logo_url}
                      alt=""
                      width={32}
                      height={32}
                      unoptimized
                      className="h-8 w-8 shrink-0 rounded-md object-contain"
                    />
                  ) : (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white/[0.06] text-xs font-bold text-muted-foreground">
                      {m.display_name.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{m.display_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {m.domain ?? "—"} · {m.source}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => setEditing(m.id)}
                    title="Modifier"
                    className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-white/[0.05] hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <form action={deleteMerchant}>
                    <input type="hidden" name="id" value={m.id} />
                    <button
                      type="submit"
                      title="Supprimer"
                      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Aliases */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {m.merchant_aliases.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1 rounded-md bg-white/[0.06] py-0.5 pl-2 pr-1 text-xs"
                >
                  {a.pattern}
                  <form action={deleteAlias} className="inline-flex">
                    <input type="hidden" name="id" value={a.id} />
                    <button
                      type="submit"
                      title="Retirer l'alias"
                      className="cursor-pointer rounded text-muted-foreground hover:text-red-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </form>
                </span>
              ))}
              <form action={addAlias} className="inline-flex items-center gap-1">
                <input type="hidden" name="merchant_id" value={m.id} />
                <input
                  name="alias"
                  placeholder="+ alias"
                  className="h-6 w-24 rounded-md border border-white/[0.08] bg-white/[0.03] px-2 text-xs outline-none focus:border-primary/40"
                />
              </form>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
