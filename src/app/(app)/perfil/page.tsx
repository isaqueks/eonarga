import { Shield } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { requireUser } from "@/lib/auth/guards";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Perfil" };

export default async function PerfilPage() {
  const { user } = await requireUser();

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-4">
        <h1 className="font-display text-xl">Perfil</h1>
        <ProfileForm
          name={user.name}
          email={user.email}
          role={user.role}
          gender={user.gender}
          testosterone={user.testosterone}
        />
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Conta</h2>
        <Link
          href="/trocar-senha"
          className="text-primary text-sm underline-offset-4 hover:underline"
        >
          Trocar senha
        </Link>
        {user.role === "admin" ? (
          <Link
            href="/admin/usuarios"
            className="text-primary flex items-center gap-1.5 text-sm underline-offset-4 hover:underline"
          >
            <Shield className="size-4" aria-hidden />
            Administração
          </Link>
        ) : null}
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Minhas avaliações</h2>
        <p className="text-muted-foreground text-sm">Nada ainda.</p>
      </section>

      <Separator />

      <form action={logout}>
        <Button type="submit" variant="outline" size="lg" className="h-11 w-full">
          Sair
        </Button>
      </form>
    </div>
  );
}
