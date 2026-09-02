"use client";

import { UserPlus } from "lucide-react";
import { useActionState, useState } from "react";

import type { TempPasswordState } from "@/actions/form-state";
import { createUser } from "@/actions/users";
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

import { TempPasswordBox } from "./temp-password-box";

const INITIAL: TempPasswordState = { ok: false };

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);
  // Trocar a key a cada abertura zera o formulário (e a senha temporária que ficou na tela).
  const [formKey, setFormKey] = useState(0);

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (next) setFormKey((k) => k + 1);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          <Button size="lg" className="h-11">
            <UserPlus className="size-4" aria-hidden />
            Novo usuário
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo usuário</DialogTitle>
          <DialogDescription>
            A senha sai gerada aqui e a pessoa troca no primeiro login.
          </DialogDescription>
        </DialogHeader>
        <CreateUserBody key={formKey} />
      </DialogContent>
    </Dialog>
  );
}

function CreateUserBody() {
  const [state, formAction, pending] = useActionState(createUser, INITIAL);

  if (state.ok && state.tempPassword) {
    return (
      <div className="flex flex-col gap-4">
        <TempPasswordBox email={state.email} password={state.tempPassword} />
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Fechar</Button>} />
        </DialogFooter>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-name">Nome</Label>
        <Input
          id="new-user-name"
          name="name"
          required
          maxLength={60}
          className="h-11"
          aria-invalid={state.fieldErrors?.name ? true : undefined}
        />
        {state.fieldErrors?.name ? (
          <p className="text-destructive text-xs">{state.fieldErrors.name}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="new-user-email">Email</Label>
        <Input
          id="new-user-email"
          name="email"
          type="email"
          inputMode="email"
          required
          className="h-11"
          aria-invalid={state.fieldErrors?.email ? true : undefined}
        />
        {state.fieldErrors?.email ? (
          <p className="text-destructive text-xs">{state.fieldErrors.email}</p>
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
          {pending ? "Criando…" : "Criar"}
        </Button>
      </DialogFooter>
    </form>
  );
}
