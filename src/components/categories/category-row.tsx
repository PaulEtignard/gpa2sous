"use client";

import { useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { deleteCategory, updateCategory } from "@/app/(app)/categories/actions";

type Category = {
  id: string;
  name: string;
  color: string;
  kind: "income" | "expense" | "transfer";
};

const KIND_LABEL: Record<Category["kind"], string> = {
  income: "Revenu",
  expense: "Dépense",
  transfer: "Transfert",
};

export function CategoryRow({ category }: { category: Category }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
        <div className="flex items-center gap-3">
          <span
            className="inline-block h-3 w-3 rounded-full"
            style={{ backgroundColor: category.color }}
          />
          <span className="font-medium">{category.name}</span>
          <Badge variant="outline" className="text-xs">
            {KIND_LABEL[category.kind]}
          </Badge>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setEditing(true)}
            aria-label="Modifier"
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <form action={deleteCategory}>
            <input type="hidden" name="id" value={category.id} />
            <Button type="submit" variant="ghost" size="icon" aria-label="Supprimer">
              <Trash2 className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <form
      action={async (fd) => {
        await updateCategory(fd);
        setEditing(false);
      }}
      className="grid grid-cols-[1fr_auto_auto_auto_auto] items-center gap-2 rounded-md border border-primary/40 bg-primary/5 px-3 py-2"
    >
      <input type="hidden" name="id" value={category.id} />
      <Input
        name="name"
        defaultValue={category.name}
        required
        className="h-9"
        autoFocus
      />
      <select
        name="kind"
        defaultValue={category.kind}
        className="h-9 rounded-md border border-input bg-secondary px-2 text-sm"
      >
        <option value="expense">Dépense</option>
        <option value="income">Revenu</option>
        <option value="transfer">Transfert</option>
      </select>
      <input
        type="color"
        name="color"
        defaultValue={category.color}
        className="h-9 w-12 rounded-md border border-input"
      />
      <Button type="submit" size="sm">
        OK
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={() => setEditing(false)}
        aria-label="Annuler"
      >
        <X className="h-4 w-4" />
      </Button>
    </form>
  );
}
