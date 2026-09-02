"use client";

import { useActionState } from "react";

import { changePassword } from "@/actions/auth";
import type { FormState } from "@/actions/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: FormState = { ok: false };

const FIELDS = [
  { name: "currentPassword", label: "Senha atual", autoComplete: "current-password" },
  { name: "newPassword", label: "Senha nova", autoComplete: "new-password" },
  { name: "confirmPassword", label: "Senha nova de novo", autoComplete: "new-password" },
] as const;

export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(changePassword, INITIAL);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      {FIELDS.map((f) => (
        <div key={f.name} className="flex flex-col gap-1.5">
          <Label htmlFor={f.name}>{f.label}</Label>
          <Input
            id={f.name}
            name={f.name}
            type="password"
            autoComplete={f.autoComplete}
            required
            className="h-11"
            aria-invalid={state.fieldErrors?.[f.name] ? true : undefined}
          />
          {state.fieldErrors?.[f.name] ? (
            <p className="text-destructive text-xs">{state.fieldErrors[f.name]}</p>
          ) : null}
        </div>
      ))}

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending}>
        {pending ? "Salvando…" : "Salvar senha"}
      </Button>
    </form>
  );
}
