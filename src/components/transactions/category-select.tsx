"use client";

import { useRef } from "react";

interface Props {
  transactionId: string;
  categoryId: string | null;
  categories: { id: string; name: string; color: string }[];
  action: (formData: FormData) => Promise<void>;
}

export function CategorySelect({ transactionId, categoryId, categories, action }: Props) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form ref={formRef} action={action} className="flex items-center gap-2">
      <input type="hidden" name="id" value={transactionId} />
      {categoryId && (
        <span
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{
            backgroundColor: categories.find((c) => c.id === categoryId)?.color ?? "#94a3b8",
          }}
        />
      )}
      <select
        name="category_id"
        defaultValue={categoryId ?? ""}
        onChange={() => formRef.current?.requestSubmit()}
        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
      >
        <option value="">Non catégorisé</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </form>
  );
}
