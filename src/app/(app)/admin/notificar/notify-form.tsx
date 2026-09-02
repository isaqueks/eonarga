"use client";

import { useActionState } from "react";

import type { NotifyState } from "@/actions/form-state";
import { sendAdminNotification } from "@/actions/push";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const INITIAL: NotifyState = { ok: false };

// Mesmo visual do select do /admin/importar: `<select>` nativo é melhor no celular.
const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-11 w-full rounded-lg border bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:ring-3 md:text-sm";

export function NotifyForm({ people }: { people: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(sendAdminNotification, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notify-target">Pra quem</Label>
        <select
          id="notify-target"
          name="target"
          defaultValue="all"
          className={SELECT_CLASS}
          aria-invalid={state.fieldErrors?.target ? true : undefined}
        >
          <option value="all">Todo mundo</option>
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.target ? (
          <p className="text-destructive text-xs">{state.fieldErrors.target}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notify-title">Título</Label>
        <Input
          id="notify-title"
          name="title"
          maxLength={60}
          defaultValue="E o narga?"
          className="h-11"
          aria-invalid={state.fieldErrors?.title ? true : undefined}
        />
        {state.fieldErrors?.title ? (
          <p className="text-destructive text-xs">{state.fieldErrors.title}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notify-body">Mensagem</Label>
        <Textarea
          id="notify-body"
          name="body"
          rows={3}
          maxLength={200}
          placeholder="Sexta tem rolê no Centro"
          aria-invalid={state.fieldErrors?.body ? true : undefined}
        />
        {state.fieldErrors?.body ? (
          <p className="text-destructive text-xs">{state.fieldErrors.body}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="notify-url">Link (opcional)</Label>
        <Input
          id="notify-url"
          name="url"
          placeholder="/lugares/sebo-do-joao"
          className="h-11"
          aria-invalid={state.fieldErrors?.url ? true : undefined}
        />
        <p className="text-muted-foreground text-xs">
          Caminho do app, começando com barra. Vazio abre o ranking.
        </p>
        {state.fieldErrors?.url ? (
          <p className="text-destructive text-xs">{state.fieldErrors.url}</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-11 self-start" disabled={pending}>
        {pending ? "Mandando…" : "Mandar"}
      </Button>

      {state.ok ? (
        <p
          aria-live="polite"
          className="border-border bg-card rounded-xl border p-3 text-sm text-pretty"
        >
          {state.recipients === 0 ? (
            <>Ninguém recebeu: essas pessoas ainda não ativaram notificações.</>
          ) : (
            <>
              Mandado pra {state.recipients} {state.recipients === 1 ? "pessoa" : "pessoas"}, em{" "}
              {state.sent} {state.sent === 1 ? "aparelho" : "aparelhos"}.
            </>
          )}
          {state.failed ? ` ${state.failed} não foram (erro no serviço de push).` : ""}
        </p>
      ) : null}
    </form>
  );
}
