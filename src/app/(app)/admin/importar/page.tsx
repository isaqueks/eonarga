import { Download } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { requireAdmin } from "@/lib/auth/guards";
import { listCategories } from "@/lib/queries/categories";

import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Importar" };

export const dynamic = "force-dynamic";

export default async function AdminImportarPage() {
  await requireAdmin();
  const categories = await listCategories();

  return (
    <div className="flex flex-col gap-6 p-4">
      <section className="flex flex-col gap-2">
        <h2 className="font-display text-base">Backup</h2>
        <p className="text-muted-foreground text-sm">
          Tudo que está no banco num arquivo só (sem as senhas). Guarda num lugar seguro.
        </p>
        <Button
          variant="outline"
          size="lg"
          className="h-11 self-start"
          nativeButton={false}
          // Download de verdade, sem client router no meio: âncora crua mesmo.
          render={<a href="/api/admin/export" />}
        >
          <Download className="size-4" aria-hidden />
          Baixar backup (JSON)
        </Button>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-base">Importar lugares</h2>
        <p className="text-muted-foreground text-sm">
          Cola os links do Google Maps ou manda o CSV da lista salva (Google Takeout). A gente
          resolve cada link, pula o que já está lá e cadastra o resto com “tem narga: não sei”.
        </p>
        <ImportForm categories={categories} />
      </section>
    </div>
  );
}
