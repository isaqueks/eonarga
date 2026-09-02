"use client";

import { useState, useTransition } from "react";

import { resetUserPassword, setUserActive, setUserRole } from "@/actions/users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { TempPasswordBox } from "./temp-password-box";

type Props = {
  userId: string;
  name: string;
  role: "admin" | "member";
  isActive: boolean;
  isSelf: boolean;
  isLastAdmin: boolean;
};

export function UserRowActions({ userId, name, role, isActive, isSelf, isLastAdmin }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  function run(confirmMessage: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    if (!window.confirm(confirmMessage)) return;
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
          size="sm"
          disabled={pending}
          onClick={() =>
            run(`Resetar a senha de ${name}? As sessões dela caem.`, async () => {
              const result = await resetUserPassword(userId);
              if (result.ok && result.tempPassword) setTempPassword(result.tempPassword);
              return result;
            })
          }
        >
          Resetar senha
        </Button>

        <Button
          variant={isActive ? "destructive" : "outline"}
          size="sm"
          disabled={pending || isSelf}
          title={isSelf ? "Você não pode desativar a si mesmo." : undefined}
          onClick={() =>
            run(
              isActive
                ? `Desativar ${name}? Ela para de logar; o conteúdo fica.`
                : `Reativar ${name}?`,
              () => setUserActive(userId, !isActive),
            )
          }
        >
          {isActive ? "Desativar" : "Ativar"}
        </Button>

        <Button
          variant="outline"
          size="sm"
          disabled={pending || isSelf || (role === "admin" && isLastAdmin)}
          title={
            isSelf
              ? "Você não pode mudar o próprio papel."
              : role === "admin" && isLastAdmin
                ? "É o último admin."
                : undefined
          }
          onClick={() =>
            run(
              role === "admin"
                ? `Tirar o admin de ${name}?`
                : `Tornar ${name} admin? Vai poder mexer em tudo.`,
              () => setUserRole(userId, role === "admin" ? "member" : "admin"),
            )
          }
        >
          {role === "admin" ? "Tirar admin" : "Tornar admin"}
        </Button>
      </div>

      {error ? <p className="text-destructive text-xs">{error}</p> : null}

      <Dialog open={tempPassword !== null} onOpenChange={(open) => !open && setTempPassword(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Senha nova de {name}</DialogTitle>
          </DialogHeader>
          {tempPassword ? <TempPasswordBox password={tempPassword} /> : null}
          <DialogFooter>
            <DialogClose render={<Button variant="outline">Fechar</Button>} />
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
