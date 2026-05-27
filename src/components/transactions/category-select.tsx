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
          className="h-8 rounded-md border border-input bg-secondary px-2 text-xs disabled:cursor-not-allowed disabled:opacity-50"
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
        /* Backdrop — clicking outside dismisses */
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={handleDismiss}
        >
          <div
            className="mx-4 w-full max-w-sm rounded-xl border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="mb-1 text-base font-semibold">
              Catégorisation groupée
            </h3>
            <p className="mb-5 text-sm text-muted-foreground">
              {dialog.count} autre{dialog.count > 1 ? "s" : ""} transaction
              {dialog.count > 1 ? "s" : ""} contenant &laquo;&nbsp;
              <span className="font-medium text-foreground">{dialog.keyword}</span>
              &nbsp;&raquo; {dialog.count > 1 ? "ne sont" : "n'est"} pas encore
              dans cette catégorie. Les catégoriser en&nbsp;
              <span className="font-medium text-foreground">
                {dialog.newCategoryName}
              </span>
              &nbsp;?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={handleDismiss}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted"
              >
                Non, juste celle-ci
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
