import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Termos",
  description: "Não tem termos. E o narga?",
};

export default function TermosPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-4 px-6 py-16">
      <h1 className="font-display text-3xl">Termos</h1>
      <p className="text-muted-foreground text-lg">Não tem termos. E o narga?</p>
      <p>
        <Link href="/" className="text-primary underline underline-offset-4">
          Voltar
        </Link>
      </p>
    </main>
  );
}
