"use client";

import { useActionState } from "react";

import { updateProfile } from "@/actions/auth";
import type { FormState } from "@/actions/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: FormState = { ok: false };

export function ProfileForm({ name, email }: { name: string; email: string }) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Nome</Label>
        <Input
          id="name"
          name="name"
          defaultValue={name}
          maxLength={60}
          required
          className="h-11"
          aria-invalid={state.fieldErrors?.name ? true : undefined}
        />
        {state.fieldErrors?.name ? (
          <p className="text-destructive text-xs">{state.fieldErrors.name}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email} readOnly disabled className="h-11" />
        <p className="text-muted-foreground text-xs">Email não muda. Fala com o admin.</p>
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}
      {state.ok ? <p className="text-accent-foreground text-sm">Salvo.</p> : null}

      <Button type="submit" size="lg" className="h-11 self-start px-6" disabled={pending}>
        {pending ? "Salvando…" : "Salvar"}
      </Button>
    </form>
  );
}
