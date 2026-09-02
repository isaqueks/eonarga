"use client";

import { useActionState, useCallback, useEffect, useState, useSyncExternalStore } from "react";

import { EMPTY_FORM_STATE } from "@/actions/form-state";
import { upsertReview } from "@/actions/reviews";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VERDICT_MAX } from "@/lib/constants";
import { cn } from "@/lib/utils";

import { NargaRatingInput } from "./narga-rating-input";
import { ReviewEditor } from "./review-editor";

/** O que fica no `localStorage` enquanto a pessoa escreve. `rating` é 0..10 (0 = sem nota). */
interface Draft {
  rating: number;
  verdict: string;
  contentHtml: string;
  visitedAt: string;
}

function draftKey(placeId: string): string {
  return `eonarga:avaliacao:${placeId}`;
}

function readDraft(placeId: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(draftKey(placeId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const value = parsed as Partial<Draft>;
    return {
      rating: typeof value.rating === "number" ? value.rating : 0,
      verdict: typeof value.verdict === "string" ? value.verdict : "",
      contentHtml: typeof value.contentHtml === "string" ? value.contentHtml : "",
      visitedAt: typeof value.visitedAt === "string" ? value.visitedAt : "",
    };
  } catch {
    return null;
  }
}

function writeDraft(placeId: string, draft: Draft) {
  try {
    window.localStorage.setItem(draftKey(placeId), JSON.stringify(draft));
  } catch {
    // Storage bloqueado (aba anônima): sem rascunho, o formulário continua funcionando.
  }
}

function clearDraft(placeId: string) {
  cacheKey = placeId;
  cacheValue = null;
  try {
    window.localStorage.removeItem(draftKey(placeId));
  } catch {
    // idem
  }
}

/**
 * Snapshot memoizado do rascunho. `useSyncExternalStore` exige identidade estável
 * entre renders; ler o storage direto devolveria um objeto novo a cada chamada.
 * Não é atualizado a cada tecla de propósito: o que interessa é "o que já estava
 * salvo quando esta tela abriu".
 */
let cacheKey: string | null = null;
let cacheValue: Draft | null = null;

function draftSnapshot(placeId: string): Draft | null {
  if (cacheKey !== placeId) {
    cacheKey = placeId;
    cacheValue = readDraft(placeId);
  }
  return cacheValue;
}

function getServerDraftSnapshot(): Draft | null {
  return null;
}

/** Ninguém mexe no rascunho por fora; a assinatura existe só pra satisfazer a API. */
function subscribeDraft() {
  return () => {};
}

function sameDraft(a: Draft, b: Draft): boolean {
  return (
    a.rating === b.rating &&
    a.verdict === b.verdict &&
    a.contentHtml === b.contentHtml &&
    a.visitedAt === b.visitedAt
  );
}

export interface ReviewFormInitial {
  /** 2..10, como está no banco. */
  rating: number;
  verdict: string;
  contentHtml: string;
  visitedAt: string | null;
}

/**
 * Formulário de avaliar. Salva rascunho no `localStorage` a cada mudança porque o
 * celular fecha aba fácil (docs/04) e devolve o rascunho na volta.
 */
export function ReviewForm({
  placeId,
  today,
  initial,
  className,
}: {
  placeId: string;
  /** Hoje em `YYYY-MM-DD`, calculado no servidor pra não dar descompasso de fuso. */
  today: string;
  /** Preenchido = modo edição. */
  initial?: ReviewFormInitial;
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(upsertReview, EMPTY_FORM_STATE);

  // Congelado no primeiro render: é a base pra saber se o rascunho guardado difere.
  const [initialValues] = useState<Draft>(() => ({
    rating: initial?.rating ?? 0,
    verdict: initial?.verdict ?? "",
    contentHtml: initial?.contentHtml ?? "",
    visitedAt: initial?.visitedAt ?? today,
  }));
  const [values, setValues] = useState<Draft>(initialValues);
  // Sobe a cada "continuar rascunho" pra remontar o que é não-controlado (nota e editor).
  const [version, setVersion] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  // O rascunho guardado, lido uma vez e memoizado — o servidor sempre vê `null`,
  // então o HTML bate na hidratação.
  const stored = useSyncExternalStore(
    subscribeDraft,
    useCallback(() => draftSnapshot(placeId), [placeId]),
    getServerDraftSnapshot,
  );
  const draft = !dismissed && stored && !sameDraft(stored, initialValues) ? stored : null;

  // Grava no ato, no próprio handler: efeito só pra isso seria cascata de render.
  function patch(changes: Partial<Draft>) {
    const next = { ...values, ...changes };
    setValues(next);
    writeDraft(placeId, next);
  }

  // Se o servidor recusou, o rascunho volta — o submit tinha acabado de limpar.
  useEffect(() => {
    if (state.error || state.fieldErrors) writeDraft(placeId, values);
  }, [state, placeId, values]);

  const fieldError = (field: string) => state.fieldErrors?.[field];
  const verdictLeft = VERDICT_MAX - values.verdict.length;

  return (
    <form
      action={formAction}
      onSubmit={() => clearDraft(placeId)}
      className={cn("flex flex-col gap-6", className)}
      noValidate
    >
      <input type="hidden" name="placeId" value={placeId} />

      {draft ? (
        <div className="border-narga/40 bg-narga/10 flex flex-col gap-2 rounded-lg border p-3">
          <p className="text-sm">
            <strong className="font-medium">Continuar rascunho?</strong> Você tinha começado a
            escrever aqui.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="lg"
              className="h-11 flex-1"
              onClick={() => {
                setValues(draft);
                setVersion((current) => current + 1);
                setDismissed(true);
              }}
            >
              Sim
            </Button>
            <Button
              type="button"
              variant="outline"
              size="lg"
              className="h-11 flex-1"
              onClick={() => {
                clearDraft(placeId);
                setDismissed(true);
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label>Sua nota</Label>
        <NargaRatingInput
          key={`rating-${version}`}
          defaultStars={values.rating / 2}
          onChange={(stars) => patch({ rating: Math.round(stars * 2) })}
        />
        {fieldError("rating") ? (
          <p className="text-destructive text-xs">{fieldError("rating")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-verdict">Veredito em uma frase</Label>
        <Input
          id="review-verdict"
          name="verdict"
          value={values.verdict}
          onChange={(event) => patch({ verdict: event.target.value })}
          maxLength={VERDICT_MAX}
          required
          placeholder="Melhor PF do centro."
          aria-invalid={fieldError("verdict") ? true : undefined}
          className="h-11"
        />
        <div className="flex justify-between gap-2">
          <p className="text-destructive text-xs">{fieldError("verdict") ?? ""}</p>
          <p className="text-muted-foreground shrink-0 text-xs tabular-nums">
            {values.verdict.length}/{VERDICT_MAX}
          </p>
        </div>
        {verdictLeft <= 0 ? (
          <p className="text-muted-foreground text-xs">Deu o limite. Corta um pedaço.</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Conta mais (opcional)</Label>
        <ReviewEditor
          key={`editor-${version}`}
          initialHtml={values.contentHtml}
          onChange={(html) => patch({ contentHtml: html })}
        />
        {fieldError("contentHtml") ? (
          <p className="text-destructive text-xs">{fieldError("contentHtml")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="review-visited-at">Quando foi?</Label>
        <Input
          id="review-visited-at"
          name="visitedAt"
          type="date"
          value={values.visitedAt}
          max={today}
          onChange={(event) => patch({ visitedAt: event.target.value })}
          className="h-11"
        />
        {fieldError("visitedAt") ? (
          <p className="text-destructive text-xs">{fieldError("visitedAt")}</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" size="lg" className="h-12 text-base" disabled={pending}>
        {pending ? "Salvando…" : initial ? "Salvar" : "Publicar"}
      </Button>
    </form>
  );
}
