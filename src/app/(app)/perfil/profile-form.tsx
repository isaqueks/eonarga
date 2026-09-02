"use client";

import { useActionState, type ReactNode } from "react";

import { updateProfile } from "@/actions/auth";
import type { FormState } from "@/actions/form-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GENDER_MAX_LENGTH, MEMBER_GENDERS, TESTOSTERONE_MEMBER_MAX } from "@/lib/profile";

const INITIAL: FormState = { ok: false };

const SELECT_CLASS =
  "border-input dark:bg-input/30 focus-visible:border-ring focus-visible:ring-ring/50 h-11 w-full rounded-lg border bg-transparent px-3 text-sm outline-none focus-visible:ring-3";

export function ProfileForm({
  name,
  email,
  role,
  gender,
  testosterone,
}: {
  name: string;
  email: string;
  role: "admin" | "member";
  gender: string | null;
  testosterone: number | null;
}) {
  const [state, formAction, pending] = useActionState(updateProfile, INITIAL);
  const isAdmin = role === "admin";

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <Field id="name" label="Nome" error={state.fieldErrors?.name}>
        <Input
          id="name"
          name="name"
          defaultValue={name}
          maxLength={60}
          required
          className="h-11"
          aria-invalid={state.fieldErrors?.name ? true : undefined}
        />
      </Field>

      <Field id="email" label="Email" hint="Email não muda. Fala com o admin.">
        <Input id="email" value={email} readOnly disabled className="h-11" />
      </Field>

      {/* Gênero: admin escreve o que quiser; membro escolhe da lista (docs/08 #25). */}
      <Field
        id="gender"
        label="Gênero"
        error={state.fieldErrors?.gender}
        hint={
          isAdmin ? "Texto livre. Privilégio de admin." : "Só tem essas duas. Reclama com o admin."
        }
      >
        {isAdmin ? (
          <Input
            id="gender"
            name="gender"
            defaultValue={gender ?? ""}
            maxLength={GENDER_MAX_LENGTH}
            className="h-11"
            aria-invalid={state.fieldErrors?.gender ? true : undefined}
          />
        ) : (
          <select
            id="gender"
            name="gender"
            defaultValue={gender ?? ""}
            className={SELECT_CLASS}
            aria-invalid={state.fieldErrors?.gender ? true : undefined}
          >
            <option value="">Prefiro não dizer</option>
            {MEMBER_GENDERS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        )}
      </Field>

      <Field
        id="testosterone"
        label="Testosterona (ng/dL)"
        error={state.fieldErrors?.testosterone}
        hint={isAdmin ? "Sem limite. Admin." : `De 0 a ${TESTOSTERONE_MEMBER_MAX}.`}
      >
        <Input
          id="testosterone"
          name="testosterone"
          type="number"
          inputMode="numeric"
          min={0}
          max={isAdmin ? undefined : TESTOSTERONE_MEMBER_MAX}
          step={1}
          defaultValue={testosterone ?? ""}
          className="h-11"
          aria-invalid={state.fieldErrors?.testosterone ? true : undefined}
        />
      </Field>

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

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p className="text-destructive text-xs">{error}</p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs">{hint}</p>
      ) : null}
    </div>
  );
}
