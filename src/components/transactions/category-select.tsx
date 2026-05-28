"use client";

import { useState, useTransition } from "react";
import {
  setCategoryDirect,
  findSimilarMerchants,
  bulkCategorizeByMerchant,
} from "@/app/(app)/transactions/actions";

interface Category {
  id: string;
  name: string;
  color: string;
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
  categories: Category[];
}

export function CategorySelect({
  transactionId,
  description,
  categoryId,
  categories,
}: Props) {
  const [currentCategoryId, setCurrentCategoryId] = useState(categoryId);
  const [isPending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const currentCategory = categories.find((c) => c.id === currentCategoryId);

  function handleChange(newValue: string) {
    const newCatId = newValue || null;
    const newCatName = categories.find((c) => c.id === newCatId)?.name ?? "";

    startTransition(async () => {
      // Optimistic UI
      setCurrentCategoryId(newCatId);

      // Persist the single transaction
      await setCategoryDirect(transactionId, newCatId);

      // Look for other transactions from the same merchant (only when setting a real category)
      if (newCatId) {
        const { keyword, count } = await findSimilarMerchants(
          transactionId,
          description,
          newCatId,
        );
        if (count > 0 && keyword) {
          setDialog({
            keyword,
            count,
            newCategoryId: newCatId,
            newCategoryName: newCatName,
          });
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

  function handleDismiss() {
    setDialog(null);
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {currentCategoryId && (
          <span
            className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: currentCategory?.color ?? "#94a3b8" }}
          />
        )}
        <select
          value={currentCategoryId ?? ""}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
          className="h-8 cursor-pointer rounded-lg border border-white/[0.07] bg-white/[0.03] px-2 text-xs text-foreground transition-all focus:outline-none focus:border-primary/40 focus:ring-2 focus:ring-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="">Non catégorisé</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {isPending && (
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent opacity-60" />
        )}
      </div>

      {dialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={handleDismiss}
        >
          <div
            className="card-surface mx-4 w-full max-w-sm animate-fade-in rounded-2xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1.5 text-base font-semibold">
              Catégorisation groupée
            </h3>
            <p className="mb-5 text-sm text-zinc-500 leading-relaxed">
              {dialog.count} autre{dialog.count > 1 ? "s" : ""} transaction
              {dialog.count > 1 ? "s" : ""} contenant{" "}
              <span className="font-medium text-foreground">&laquo;&nbsp;{dialog.keyword}&nbsp;&raquo;</span>{" "}
              {dialog.count > 1 ? "ne sont" : "n'est"} pas encore dans cette catégorie.
              Les catégoriser en{" "}
              <span className="font-medium text-foreground">{dialog.newCategoryName}</span>
              &nbsp;?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="cursor-pointer rounded-lg px-3 py-2 text-sm text-zinc-500 transition-colors hover:bg-white/[0.04] hover:text-zinc-300"
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
        </div>
      )}
    </>
  );
}
