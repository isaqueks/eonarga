"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState, useTransition } from "react";

import { deleteCategory, moveCategory } from "@/actions/categories";
import { Button } from "@/components/ui/button";

import { EditCategoryDialog, type CategoryDraft } from "./category-dialog";

export function CategoryRowActions({
  category,
  placeCount,
  isFirst,
  isLast,
}: {
  category: CategoryDraft;
  placeCount: number;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) setError(result.error ?? "Deu ruim. Tenta de novo.");
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-1">
        <Button
          variant="outline"
          size="icon-lg"
          disabled={pending || isFirst}
          aria-label={`Subir ${category.name}`}
          onClick={() => run(() => moveCategory(category.id, "up"))}
        >
          <ChevronUp className="size-4" aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon-lg"
          disabled={pending || isLast}
          aria-label={`Descer ${category.name}`}
          onClick={() => run(() => moveCategory(category.id, "down"))}
        >
          <ChevronDown className="size-4" aria-hidden />
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Editar
        </Button>
        <Button
          variant="destructive"
          size="sm"
          disabled={pending || placeCount > 0}
          title={placeCount > 0 ? "Tem lugar usando essa categoria." : undefined}
          onClick={() => {
            if (!window.confirm(`Excluir a categoria ${category.name}?`)) return;
            run(() => deleteCategory(category.id));
          }}
        >
          Excluir
        </Button>
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <EditCategoryDialog category={category} open={editing} onOpenChange={setEditing} />
    </div>
  );
}
