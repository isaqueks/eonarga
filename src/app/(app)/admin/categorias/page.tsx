import type { Metadata } from "next";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth/guards";
import { listCategoriesWithCounts } from "@/lib/queries/categories";

import { CreateCategoryDialog } from "./category-dialog";
import { CategoryRowActions } from "./category-row-actions";

export const metadata: Metadata = { title: "Categorias" };

export default async function AdminCategoriasPage() {
  await requireAdmin();
  const rows = await listCategoriesWithCounts();

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-sm">
          {rows.length} {rows.length === 1 ? "categoria" : "categorias"}. A ordem vale pras chips e
          pro formulário.
        </p>
        <CreateCategoryDialog />
      </div>

      <div className="border-border overflow-x-auto rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12">Emoji</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Slug</TableHead>
              <TableHead>Cor</TableHead>
              <TableHead className="text-right">Lugares</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={row.id}>
                <TableCell className="text-lg">{row.emoji}</TableCell>
                <TableCell className="font-medium whitespace-nowrap">{row.name}</TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {row.slug}
                </TableCell>
                <TableCell>
                  <span className="flex items-center gap-2">
                    <span
                      aria-hidden
                      className="border-border size-5 shrink-0 rounded-full border"
                      style={{ backgroundColor: row.color }}
                    />
                    <code className="text-muted-foreground text-xs">{row.color}</code>
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{row.placeCount}</TableCell>
                <TableCell className="text-right">
                  <CategoryRowActions
                    category={{
                      id: row.id,
                      name: row.name,
                      emoji: row.emoji,
                      color: row.color,
                    }}
                    placeCount={row.placeCount}
                    isFirst={index === 0}
                    isLast={index === rows.length - 1}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {rows.length === 0 ? (
        <p className="text-muted-foreground py-8 text-center text-sm">
          Nenhuma categoria. Roda o seed ou cria a primeira aí em cima.
        </p>
      ) : null}
    </div>
  );
}

export const dynamic = "force-dynamic";
