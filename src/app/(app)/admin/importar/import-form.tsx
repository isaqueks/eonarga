"use client";

import { useActionState } from "react";

import type { ImportReport, ImportState } from "@/actions/form-state";
import { importPlaces } from "@/actions/import";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Category } from "@/lib/db/schema";
import { cn } from "@/lib/utils";

const INITIAL: ImportState = { ok: false };

const SELECT_CLASS =
  "border-input focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 h-11 w-full rounded-lg border bg-transparent px-2.5 text-base transition-colors outline-none focus-visible:ring-3 md:text-sm";

export function ImportForm({ categories }: { categories: Category[] }) {
  const [state, formAction, pending] = useActionState(importPlaces, INITIAL);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="import-links">Cole links do Google Maps, um por linha</Label>
        <Textarea
          id="import-links"
          name="links"
          rows={6}
          placeholder={"https://maps.app.goo.gl/...\nhttps://maps.app.goo.gl/..."}
          className="font-mono text-xs"
        />
        <p className="text-muted-foreground text-xs">No máximo 100 linhas por vez.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="import-csv">Ou manda o CSV do Google Takeout</Label>
        <Input id="import-csv" name="csv" type="file" accept=".csv,text/csv" className="h-11" />
        {state.fieldErrors?.csv ? (
          <p className="text-destructive text-xs">{state.fieldErrors.csv}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="import-category">Categoria dos lugares importados</Label>
        <select
          id="import-category"
          name="categoryId"
          defaultValue={categories[0]?.id ?? ""}
          className={SELECT_CLASS}
          aria-invalid={state.fieldErrors?.categoryId ? true : undefined}
        >
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.emoji} {category.name}
            </option>
          ))}
        </select>
        {state.fieldErrors?.categoryId ? (
          <p className="text-destructive text-xs">{state.fieldErrors.categoryId}</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-11 self-start" disabled={pending}>
        {pending ? "Importando…" : "Importar"}
      </Button>

      {state.report ? <Report report={state.report} /> : null}
    </form>
  );
}

function Report({ report }: { report: ImportReport }) {
  const total = report.created.length + report.skipped.length + report.failed.length;

  return (
    <div
      aria-live="polite"
      className="border-border bg-card flex flex-col gap-4 rounded-xl border p-4"
    >
      <p className="text-sm font-semibold">
        {total} {total === 1 ? "linha processada" : "linhas processadas"}: {report.created.length}{" "}
        {report.created.length === 1 ? "novo" : "novos"}, {report.skipped.length}{" "}
        {report.skipped.length === 1 ? "repetido" : "repetidos"}, {report.failed.length}{" "}
        {report.failed.length === 1 ? "com problema" : "com problemas"}.
      </p>

      <NameList
        title="Cadastrados"
        empty="Nenhum lugar novo dessa vez."
        names={report.created}
        className="text-narga"
      />

      <NameList title="Já estavam lá" names={report.skipped} className="text-muted-foreground" />

      {report.failed.length > 0 ? (
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Não rolou</h3>
          <ul className="flex flex-col gap-1 text-xs">
            {report.failed.map((item, index) => (
              <li key={`${item.line}-${index}`} className="text-muted-foreground">
                <span className="font-mono break-all">{item.line}</span> — {item.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function NameList({
  title,
  names,
  empty,
  className,
}: {
  title: string;
  names: string[];
  empty?: string;
  className?: string;
}) {
  if (names.length === 0) {
    return empty ? <p className="text-muted-foreground text-sm">{empty}</p> : null;
  }

  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-sm font-medium">
        {title} ({names.length})
      </h3>
      <ul className={cn("flex flex-col gap-0.5 text-xs", className)}>
        {names.map((name, index) => (
          <li key={`${name}-${index}`}>{name}</li>
        ))}
      </ul>
    </div>
  );
}
