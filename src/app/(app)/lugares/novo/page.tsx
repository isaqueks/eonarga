import type { Metadata } from "next";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/guards";
import { MAP_CENTER } from "@/lib/config";
import { listCategories } from "@/lib/queries/categories";

import { NewPlaceWizard } from "./new-place-wizard";

export const metadata: Metadata = { title: "Novo lugar" };

export default async function NovoLugarPage() {
  await requireUser();
  const categories = await listCategories();

  if (categories.length === 0) {
    return (
      <EmptyState
        title="Sem categorias, sem lugar."
        description="Um admin precisa cadastrar as categorias antes (Administração → Categorias)."
      >
        <Button
          variant="outline"
          size="lg"
          className="h-11"
          nativeButton={false}
          render={<Link href="/ranking" />}
        >
          Voltar
        </Button>
      </EmptyState>
    );
  }

  return <NewPlaceWizard categories={categories} center={MAP_CENTER} />;
}

export const dynamic = "force-dynamic";
