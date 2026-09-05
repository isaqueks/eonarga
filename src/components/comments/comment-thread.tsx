"use client";

import { Heart, MessageCircle, Reply, Trash2 } from "lucide-react";
import { useActionState, useOptimistic, useRef, useState, useTransition } from "react";

import { addComment, deleteComment, toggleCommentLike } from "@/actions/comments";
import { EMPTY_FORM_STATE } from "@/actions/form-state";
import { addPostComment, deletePostComment } from "@/actions/posts";
import { MentionText } from "@/components/mentions/mention-text";
import {
  MentionTextarea,
  type MentionTextareaHandle,
} from "@/components/mentions/mention-textarea";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { COMMENT_MAX } from "@/lib/constants";
import { mentionToken } from "@/lib/mentions";
import { cn } from "@/lib/utils";

/**
 * Um comentário pronto pra tela. O "há x" vem calculado do servidor (igual ao card):
 * o relógio do cliente é outro e daria warning de hidratação.
 */
export interface CommentView {
  id: string;
  body: string;
  when: string;
  authorName: string;
  authorAvatarId: string | null;
  canDelete: boolean;
  /** Quantas curtidas o comentário tem e se quem está olhando é uma delas. */
  likes: number;
  likedByMe: boolean;
}

/** Onde a thread mora: resposta numa avaliação ou comentário num post. */
export type CommentTarget = { type: "review"; id: string } | { type: "post"; id: string };

/** A mesma thread com a copy de cada casa: na avaliação é "resposta", no post é "comentário". */
const COPY = {
  review: {
    field: "reviewId",
    cta: "Responder",
    label: "Sua resposta",
    placeholder: "Discorda? Fala.",
    confirm: "Apagar essa resposta? Não dá pra desfazer.",
    deleteLabel: (author: string) => `Apagar resposta de ${author}`,
    likeLabel: (author: string) => `Curtir resposta de ${author}`,
  },
  post: {
    field: "postId",
    cta: "Comentar",
    label: "Seu comentário",
    placeholder: "Comenta aí.",
    confirm: "Apagar esse comentário? Não dá pra desfazer.",
    deleteLabel: (author: string) => `Apagar comentário de ${author}`,
    likeLabel: (author: string) => `Curtir comentário de ${author}`,
  },
} as const;

/** Quantos comentários aparecem antes do "ver todos". */
const PREVIEW = 3;

const PENDING_ID = "__pending__";

/** "Responder" e "Apagar": texto pequeno, lado a lado, embaixo do comentário. */
const ACTION_CLASS =
  "hover:text-foreground focus-visible:ring-ring/50 flex h-8 items-center gap-1 rounded-md px-1 outline-none focus-visible:ring-3 disabled:opacity-60";

/**
 * Thread curta de uma avaliação ou de um post. Otimista: o comentário aparece cinza
 * enquanto o servidor grava e é substituído pelo de verdade quando a página revalida.
 */
export function CommentThread({
  target,
  comments,
  canReply = true,
  className,
}: {
  target: CommentTarget;
  comments: CommentView[];
  /** Lugar arquivado não recebe resposta nova; a thread antiga continua visível. */
  canReply?: boolean;
  className?: string;
}) {
  const copy = COPY[target.type];
  const add = target.type === "review" ? addComment : addPostComment;
  const del = target.type === "review" ? deleteComment : deletePostComment;

  const [state, formAction, sending] = useActionState(add, EMPTY_FORM_STATE);
  const [optimistic, addOptimistic] = useOptimistic(comments, (current, body: string) => [
    ...current,
    {
      id: PENDING_ID,
      body,
      when: "enviando...",
      authorName: "você",
      authorAvatarId: null,
      canDelete: false,
      likes: 0,
      likedByMe: false,
    },
  ]);

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [removing, startRemoving] = useTransition();
  // Erro de apagar ou de curtir: um lugar só, embaixo da lista.
  const [actionError, setActionError] = useState<string | null>(null);
  const textareaRef = useRef<MentionTextareaHandle>(null);

  const hidden = expanded ? 0 : Math.max(0, optimistic.length - PREVIEW);
  const visible = hidden > 0 ? optimistic.slice(-PREVIEW) : optimistic;

  function openForm() {
    setOpen(true);
    // O `requestAnimationFrame` espera o textarea existir pra dar foco nele.
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  /** "Responder": abre o formulário com `@Nome: ` no começo do texto. */
  function replyTo(authorName: string) {
    if (!open) {
      const token = mentionToken(authorName);
      setDraft((current) => (current.startsWith(token) ? current : token + current));
      openForm();
      return;
    }
    textareaRef.current?.prependMention(authorName);
  }

  function remove(id: string) {
    if (!window.confirm(copy.confirm)) return;
    setActionError(null);
    startRemoving(async () => {
      const result = await del(id);
      if (!result.ok) setActionError(result.error ?? "Não rolou apagar.");
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
          ver todos ({optimistic.length})
        </button>
      ) : null}

      {visible.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {visible.map((comment) => {
            const pending = comment.id === PENDING_ID;
            const actions = !pending && (canReply || comment.canDelete);
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
                    <MentionText text={comment.body} />
                  </p>
                  {actions ? (
                    <div className="text-muted-foreground -mb-1 -ml-1 flex items-center gap-2 text-xs font-medium">
                      {canReply ? (
                        <button
                          type="button"
                          onClick={() => replyTo(comment.authorName)}
                          aria-label={`Responder a ${comment.authorName}`}
                          className={ACTION_CLASS}
                        >
                          <Reply className="size-3.5" aria-hidden />
                          Responder
                        </button>
                      ) : null}
                      {comment.canDelete ? (
                        <button
                          type="button"
                          onClick={() => remove(comment.id)}
                          disabled={removing}
                          aria-label={copy.deleteLabel(comment.authorName)}
                          className={cn(ACTION_CLASS, "hover:text-destructive")}
                        >
                          <Trash2 className="size-3.5" aria-hidden />
                          Apagar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {!pending ? (
                  <CommentLikeButton
                    target={target}
                    commentId={comment.id}
                    label={copy.likeLabel(comment.authorName)}
                    likes={comment.likes}
                    likedByMe={comment.likedByMe}
                    onError={setActionError}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-destructive text-xs">
          {actionError}
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
          <input type="hidden" name={copy.field} value={target.id} />
          <MentionTextarea
            handleRef={textareaRef}
            name="body"
            rows={2}
            maxLength={COMMENT_MAX}
            value={draft}
            onValueChange={setDraft}
            placeholder={copy.placeholder}
            aria-label={copy.label}
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
          {copy.cta}
        </Button>
      )}
    </div>
  );
}

/**
 * O coração do comentário, com a contagem do lado. Otimista como as reações: pinta na
 * hora e volta atrás se o servidor reclamar. Sem emoji de propósito (docs/08 #43).
 */
function CommentLikeButton({
  target,
  commentId,
  label,
  likes,
  likedByMe,
  onError,
}: {
  target: CommentTarget;
  commentId: string;
  /** "Curtir comentário de Fulano" (a contagem entra no fim do aria-label). */
  label: string;
  likes: number;
  likedByMe: boolean;
  onError: (message: string | null) => void;
}) {
  const [pending, startTransition] = useTransition();
  const [state, setState] = useState({ count: likes, mine: likedByMe });
  // Ressincroniza quando o servidor revalida a página com outros números.
  const [lastProps, setLastProps] = useState({ likes, likedByMe });
  if (lastProps.likes !== likes || lastProps.likedByMe !== likedByMe) {
    setLastProps({ likes, likedByMe });
    setState({ count: likes, mine: likedByMe });
  }

  function toggle() {
    const current = state;
    const optimistic = {
      count: Math.max(0, current.count + (current.mine ? -1 : 1)),
      mine: !current.mine,
    };
    setState(optimistic);
    onError(null);

    startTransition(async () => {
      const result = await toggleCommentLike(target.type, commentId);
      if (!result.ok) {
        setState(current);
        onError(result.error ?? "Não rolou curtir. Tenta de novo.");
        return;
      }
      setState({
        count: result.count ?? optimistic.count,
        mine: result.liked ?? optimistic.mine,
      });
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={state.mine}
      aria-label={`${label}${state.count > 0 ? ` (${state.count})` : ""}`}
      className={cn(
        "focus-visible:ring-ring/50 -mt-1 -mr-1.5 flex h-9 min-w-9 shrink-0 items-center justify-center gap-1 rounded-full px-1.5 text-xs font-medium tabular-nums transition-colors outline-none focus-visible:ring-3 disabled:opacity-60",
        state.mine ? "text-rose-500" : "text-muted-foreground hover:text-foreground",
      )}
    >
      <Heart className={cn("size-4", state.mine && "fill-current")} aria-hidden />
      {state.count > 0 ? <span>{state.count}</span> : null}
    </button>
  );
}
