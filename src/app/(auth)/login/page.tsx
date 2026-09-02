import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/guards";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar" };

function safeNext(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !raw.startsWith("/")) return undefined;
  if (raw.startsWith("//") || raw.startsWith("/\\")) return undefined;
  return raw;
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const current = await getCurrentUser();
  if (current) redirect("/");

  const { next } = await searchParams;

  return (
    <div className="flex flex-col items-center gap-6">
      <Image
        src="/logo.jpg"
        alt="Cachorro assustado perguntando: e o narga?"
        width={160}
        height={160}
        priority
        className="rounded-2xl shadow-lg"
      />
      <h1 className="font-display text-2xl">E o narga?</h1>

      <LoginForm next={safeNext(next)} />

      <p className="text-muted-foreground text-center text-xs text-balance">
        Sem conta? Pede pro admin. Ele sabe quem é.
      </p>
    </div>
  );
}
