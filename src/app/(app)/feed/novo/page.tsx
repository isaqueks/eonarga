import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { MAP_CENTER } from "@/lib/config";
import { listPostPlaceOptions } from "@/lib/queries/posts";

import { NewPostForm } from "./new-post-form";

export const metadata: Metadata = { title: "Postar" };

export const dynamic = "force-dynamic";

export default async function NewPostPage() {
  await requireUser();

  // A lista inteira de lugares ativos vai pro cliente: é ela que alimenta a busca,
  // a ordenação por distância e o "você tá no Sebo do João?" (menos de 500 linhas).
  const places = await listPostPlaceOptions();

  return (
    <div className="flex flex-1 flex-col gap-4 p-4">
      <header className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon-lg"
          aria-label="Voltar pro feed"
          nativeButton={false}
          render={<Link href="/feed" />}
        >
          <ArrowLeft className="size-5" aria-hidden />
        </Button>
        <h1 className="font-display text-xl">Postar</h1>
      </header>

      <NewPostForm places={places} center={MAP_CENTER} />
    </div>
  );
}
