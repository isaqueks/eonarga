"use client";

import { MessageCircle, Trash2 } from "lucide-react";
import { useActionState, useOptimistic, useRef, useState, useTransition } from "react";

import { addComment, deleteComment } from "@/actions/comments";
import { EMPTY_FORM_STATE } from "@/actions/form-state";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { UserAvatar } from "@/components/user-avatar";
import { COMMENT_MAX } from "@/lib/constants";
import { cn } from "@/lib/utils";

/**
 * Uma resposta pronta pra tela. O "há x" vem calculado do servidor (igual ao card da
 * avaliação): o relógio do cliente é outro e daria warning de hidratação.
 */
export interface CommentView {
  id: string;
  body: string;
  when: string;
  authorName: string;
  authorAvatarId: string | null;
  canDelete: boolean;
}

/** Quantas respostas aparecem antes do "ver todas". */
const PREVIEW = 3;

const PENDING_ID = "__pending__";

/**
 * Thread curta de uma avaliação. Otimista: a resposta aparece cinza enquanto o
 * servidor grava e é substituída pela de verdade quando a página revalida.
 */
export function ReviewComments({
  reviewId,
  comments,
  canReply = true,
  className,
}: {
  reviewId: string;
  comments: CommentView[];
  /** Lugar arquivado não recebe resposta nova; a thread antiga continua visível. */
  canReply?: boolean;
  className?: string;
}) {
  const [state, formAction, sending] = useActionState(addComment, EMPTY_FORM_STATE);
  const [optimistic, addOptimistic] = useOptimistic(comments, (current, body: string) => [
    ...current,
    {
      id: PENDING_ID,
      body,
      when: "enviando...",
      authorName: "você",
      authorAvatarId: null,
      canDelete: false,
    },
  ]);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [removing, startRemoving] = useTransition();
  const [removeError, setRemoveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const hidden = expanded ? 0 : Math.max(0, optimistic.length - PREVIEW);
  const visible = hidden > 0 ? optimistic.slice(-PREVIEW) : optimistic;

  function openForm() {
    setOpen(true);
    // O `requestAnimationFrame` espera o textarea existir pra dar foco nele.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function remove(id: string) {
    if (!window.confirm("Apagar essa resposta? Não dá pra desfazer.")) return;
    setRemoveError(null);
    startRemoving(async () => {
      const result = await deleteComment(id);
      if (!result.ok) setRemoveError(result.error ?? "Não rolou apagar.");
    });
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {hidden > 0 ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 self-start rounded-md text-xs font-medium underline-offset-2 outline-none hover:underline focus-visible:ring-3"
        >
          ver todas ({optimistic.length})
        </button>
      ) : null}

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {visible.map((comment) => {
            const pending = comment.id === PENDING_ID;
            return (
              <li
                key={comment.id}
                className={cn("flex items-start gap-2", pending && "opacity-60")}
              >
                <UserAvatar name={comment.authorName} avatarId={comment.authorAvatarId} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="text-foreground font-semibold">{comment.authorName}</span>
                    {comment.when ? <span>{comment.when}</span> : null}
                  </p>
                  <p className="text-[0.9375rem] leading-snug break-words whitespace-pre-wrap">
                    {comment.body}
                  </p>
                </div>
                {comment.canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon-lg"
                    className="text-muted-foreground hover:text-destructive size-9 shrink-0"
                    onClick={() => remove(comment.id)}
                    disabled={removing}
                    aria-label={`Apagar resposta de ${comment.authorName}`}
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {removeError ? (
        <p role="alert" className="text-destructive text-xs">
          {removeError}
        </p>
      ) : null}

      {!canReply ? null : open ? (
        <form
          action={(formData) => {
            const body = String(formData.get("body") ?? "").trim();
            if (body === "") return;
            addOptimistic(body);
            setDraft("");
            formAction(formData);
          }}
          className="flex flex-col gap-1.5"
        >
          <input type="hidden" name="reviewId" value={reviewId} />
          <Textarea
            ref={textareaRef}
            name="body"
            rows={2}
            maxLength={COMMENT_MAX}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Discorda? Fala."
            aria-label="Sua resposta"
            aria-invalid={state.fieldErrors?.body ? true : undefined}
            className="min-h-16 text-[0.9375rem]"
          />
          {(state.fieldErrors?.body ?? state.error) ? (
            <p role="alert" className="text-destructive text-xs">
              {state.fieldErrors?.body ?? state.error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button
              type="submit"
              size="lg"
              className="h-11 px-4"
              disabled={sending || draft.trim() === ""}
            >
              {sending ? "Enviando..." : "Enviar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 px-4"
              onClick={() => {
                setOpen(false);
                setDraft("");
              }}
            >
              Cancelar
            </Button>
          </div>
        </form>
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={openForm}
          className="text-muted-foreground h-9 self-start"
        >
          <MessageCircle className="size-3.5" aria-hidden />
          Responder
        </Button>
      )}
    </div>
  );
}
