"use client";

import { Plus } from "lucide-react";
import { useActionState, useState } from "react";

import { createCategory, updateCategory } from "@/actions/categories";
import { EMPTY_FORM_STATE, type FormState } from "@/actions/form-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface CategoryDraft {
  id: string;
  name: string;
  emoji: string;
  color: string;
}

export function CreateCategoryDialog() {
  const [open, setOpen] = useState(false);
  // Trocar a key a cada abertura zera o formulário e os erros da tentativa anterior.
  const [formKey, setFormKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setFormKey((k) => k + 1);
      }}
    >
      <DialogTrigger
        render={
          <Button size="lg" className="h-11">
            <Plus className="size-4" aria-hidden />
            Nova categoria
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova categoria</DialogTitle>
          <DialogDescription>
            Emoji e cor aparecem no pino do mapa e na chip do ranking.
          </DialogDescription>
        </DialogHeader>
        <CategoryForm key={formKey} action={createCategory} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

export function EditCategoryDialog({
  category,
  open,
  onOpenChange,
}: {
  category: CategoryDraft;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar {category.name}</DialogTitle>
          <DialogDescription>O slug não muda: links já compartilhados continuam.</DialogDescription>
        </DialogHeader>
        <CategoryForm
          action={updateCategory}
          initial={category}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function CategoryForm({
  action,
  initial,
  onDone,
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  initial?: CategoryDraft;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(action, EMPTY_FORM_STATE);
  const [color, setColor] = useState(initial?.color ?? "#8fd3b0");

  // A action revalida a lista; aqui só fechamos o diálogo.
  const [wasOk, setWasOk] = useState(false);
  if (state.ok && !wasOk) {
    setWasOk(true);
    onDone();
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {initial ? <input type="hidden" name="id" value={initial.id} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-name">Nome</Label>
        <Input
          id="category-name"
          name="name"
          defaultValue={initial?.name ?? ""}
          maxLength={40}
          required
          className="h-11"
          aria-invalid={state.fieldErrors?.name ? true : undefined}
        />
        {state.fieldErrors?.name ? (
          <p className="text-destructive text-xs">{state.fieldErrors.name}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-emoji">Emoji</Label>
        <Input
          id="category-emoji"
          name="emoji"
          defaultValue={initial?.emoji ?? ""}
          maxLength={4}
          required
          placeholder="📚"
          className="h-11 w-20 text-center text-lg"
          aria-invalid={state.fieldErrors?.emoji ? true : undefined}
        />
        {state.fieldErrors?.emoji ? (
          <p className="text-destructive text-xs">{state.fieldErrors.emoji}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="category-color">Cor</Label>
        <div className="flex items-center gap-2">
          <input
            id="category-color"
            type="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            aria-label="Escolher a cor"
            className="border-border size-11 shrink-0 cursor-pointer rounded-lg border bg-transparent p-1"
          />
          <Input
            name="color"
            value={color}
            onChange={(event) => setColor(event.target.value)}
            maxLength={7}
            pattern="#[0-9a-fA-F]{6}"
            className="h-11 font-mono"
            aria-invalid={state.fieldErrors?.color ? true : undefined}
          />
        </div>
        {state.fieldErrors?.color ? (
          <p className="text-destructive text-xs">{state.fieldErrors.color}</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <DialogFooter>
        <DialogClose render={<Button variant="outline">Cancelar</Button>} />
        <Button type="submit" disabled={pending}>
          {pending ? "Salvando…" : "Salvar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
