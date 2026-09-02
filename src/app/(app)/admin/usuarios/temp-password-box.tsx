"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

/** Mostra a senha temporária uma vez só, com botão de copiar. Depois de fechar, some. */
export function TempPasswordBox({ email, password }: { email?: string; password: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sem permissão de clipboard (http, navegador antigo): a senha está na tela pra copiar na mão.
      setCopied(false);
    }
  }

  return (
    <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-lg border p-3">
      <p className="text-muted-foreground text-xs">
        Senha temporária{email ? ` de ${email}` : ""}. Aparece uma vez só — copia e manda pra
        pessoa.
      </p>
      <div className="flex items-center gap-2">
        <code className="bg-background flex-1 rounded-md px-2 py-1.5 font-mono text-sm break-all select-all">
          {password}
        </code>
        <Button type="button" variant="outline" size="icon-lg" onClick={copy} aria-label="Copiar">
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
        </Button>
      </div>
    </div>
  );
}
