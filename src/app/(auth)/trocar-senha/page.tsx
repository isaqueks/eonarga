import type { Metadata } from "next";
import Link from "next/link";

import { requireUserAllowPasswordChange } from "@/lib/auth/guards";

import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Trocar senha" };

export default async function ChangePasswordPage() {
  const { user } = await requireUserAllowPasswordChange();

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-xl">Trocar senha</h1>
        <p className="text-muted-foreground text-sm">
          {user.mustChangePassword
            ? "Sua senha é temporária. Escolhe uma de verdade."
            : "Mínimo de 8 caracteres. Os outros aparelhos vão cair."}
        </p>
      </div>

      <ChangePasswordForm />

      {user.mustChangePassword ? null : (
        <Link href="/perfil" className="text-muted-foreground text-center text-xs hover:underline">
          Deixa pra depois
        </Link>
      )}
    </div>
  );
}
