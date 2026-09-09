"use client";

import { Camera, Heart, MessageCircle, Mic, Reply, Trash2, X } from "lucide-react";
import {
  useActionState,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from "react";

import { addComment, deleteComment, toggleCommentLike } from "@/actions/comments";
import { EMPTY_FORM_STATE } from "@/actions/form-state";
import { addPostComment, deletePostComment } from "@/actions/posts";
import { MentionText } from "@/components/mentions/mention-text";
import {
  MentionTextarea,
  type MentionTextareaHandle,
} from "@/components/mentions/mention-textarea";
import { AudioPlayer } from "@/components/posts/audio-player";
import {
  analyzeAudioFile,
  AudioRecorder,
  canRecordAudio,
  type Recording,
} from "@/components/posts/audio-recorder";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { AUDIO_MAX_BYTES, COMMENT_MAX, PHOTO_MAX_BYTES } from "@/lib/constants";
import { mentionToken } from "@/lib/mentions";
import { cn } from "@/lib/utils";

import { CommentPhoto, type CommentPhotoView } from "./comment-photo";

/** O áudio de um comentário, pro player. */
export interface CommentAudioView {
  url: string;
  durationMs: number;
  peaks: number[] | null;
}

/**
 * Um comentário pronto pra tela. O "há x" vem calculado do servidor (igual ao card):
 * o relógio do cliente é outro e daria warning de hidratação.
 */
export interface CommentView {
  id: string;
  /** Texto puro; vazio quando o comentário é só foto ou só áudio (docs/08 #52). */
  body: string;
  /** A foto do comentário, quando tem. */
  photo: CommentPhotoView | null;
  /** O áudio do comentário, quando tem. */
  audio: CommentAudioView | null;
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
    photoLabel: "Foto da resposta",
    audioLabel: "Áudio da resposta",
  },
  post: {
    field: "postId",
    cta: "Comentar",
    label: "Seu comentário",
    placeholder: "Comenta aí.",
    confirm: "Apagar esse comentário? Não dá pra desfazer.",
    deleteLabel: (author: string) => `Apagar comentário de ${author}`,
    likeLabel: (author: string) => `Curtir comentário de ${author}`,
    photoLabel: "Foto do comentário",
    audioLabel: "Áudio do comentário",
  },
} as const;

/** Quantos comentários aparecem antes do "ver todos". */
const PREVIEW = 3;

const PENDING_ID = "__pending__";

const PHOTO_TOO_BIG = "Foto grande demais (máximo 10 MB).";
const AUDIO_TOO_BIG = "Áudio grande demais (máximo 20 MB).";

/** "Responder" e "Apagar": texto pequeno, lado a lado, embaixo do comentário. */
const ACTION_CLASS =
  "hover:text-foreground focus-visible:ring-ring/50 flex h-8 items-center gap-1 rounded-md px-1 outline-none focus-visible:ring-3 disabled:opacity-60";

/** Os botões "📷" e "🎤" da caixa: redondos, do tamanho do dedo. */
const ATTACH_CLASS =
  "text-muted-foreground hover:text-foreground focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 disabled:opacity-60";

/**
 * O anexo escolhido, antes de enviar (docs/08 #52). A foto fica no próprio input
 * (o FormData a leva sozinho); a gravação não passa por input e vai no FormData na
 * hora de enviar; o áudio da galeria fica no input dele.
 */
type Attachment =
  | { kind: "photo"; url: string }
  | {
      kind: "audio";
      url: string;
      durationMs: number;
      peaks: number[] | null;
      /** A gravação do app; null quando o áudio veio do input da galeria. */
      recording: Recording | null;
    };

/** O que a lista mostra em cinza enquanto o servidor grava. */
interface PendingComment {
  body: string;
  photo: CommentPhotoView | null;
  audio: CommentAudioView | null;
}

/**
 * Thread curta de uma avaliação ou de um post. Otimista: o comentário aparece cinza
 * enquanto o servidor grava e é substituído pelo de verdade quando a página revalida.
 * Comentário pode ser texto, foto ou áudio (gravado ou da galeria, quando o navegador
 * não grava), um anexo por vez.
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
  const [optimistic, addOptimistic] = useOptimistic(
    comments,
    (current, pending: PendingComment) => [
      ...current,
      {
        id: PENDING_ID,
        body: pending.body,
        photo: pending.photo,
        audio: pending.audio,
        when: "enviando...",
        authorName: "você",
        authorAvatarId: null,
        canDelete: false,
        likes: 0,
        likedByMe: false,
      },
    ],
  );

  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [draft, setDraft] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [recording, setRecording] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [removing, startRemoving] = useTransition();
  // Erro de apagar ou de curtir: um lugar só, embaixo da lista.
  const [actionError, setActionError] = useState<string | null>(null);
  const textareaRef = useRef<MentionTextareaHandle>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  // URLs de prévia que o navegador criou. A do comentário enviado fica viva até a
  // página revalidar (o otimista ainda mostra a foto); tudo é devolvido ao desmontar.
  const urlsRef = useRef<string[]>([]);

  useEffect(() => {
    const urls = urlsRef.current;
    return () => {
      for (const url of urls) URL.revokeObjectURL(url);
    };
  }, []);

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

  function keepUrl(url: string): string {
    urlsRef.current.push(url);
    return url;
  }

  /** Tira o anexo da caixa (e dos inputs), sem mexer no texto. */
  function clearAttachment() {
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (audioInputRef.current) audioInputRef.current.value = "";
    setAttachment(null);
    setMediaError(null);
  }

  function handlePhotoChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (audioInputRef.current) audioInputRef.current.value = "";
    if (file.size > PHOTO_MAX_BYTES) {
      input.value = "";
      setAttachment(null);
      setMediaError(PHOTO_TOO_BIG);
      return;
    }
    setMediaError(null);
    setAttachment({ kind: "photo", url: keepUrl(URL.createObjectURL(file)) });
  }

  /** Áudio da galeria: só quando o navegador não grava. Duração e desenho vêm depois. */
  function handleAudioChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    if (!file) return;
    if (photoInputRef.current) photoInputRef.current.value = "";
    if (file.size > AUDIO_MAX_BYTES) {
      input.value = "";
      setAttachment(null);
      setMediaError(AUDIO_TOO_BIG);
      return;
    }
    setMediaError(null);
    const url = keepUrl(URL.createObjectURL(file));
    setAttachment({ kind: "audio", url, durationMs: 0, peaks: null, recording: null });
    void analyzeAudioFile(file).then((meta) => {
      if (audioInputRef.current?.files?.[0] !== file) return;
      setAttachment({ kind: "audio", url, ...meta, recording: null });
    });
  }

  function startRecording() {
    if (!canRecordAudio()) {
      audioInputRef.current?.click();
      return;
    }
    clearAttachment();
    setRecording(true);
  }

  function finishRecording(next: Recording) {
    setRecording(false);
    keepUrl(next.url);
    setAttachment({
      kind: "audio",
      url: next.url,
      durationMs: next.durationMs,
      peaks: next.peaks,
      recording: next,
    });
  }

  function closeForm() {
    setOpen(false);
    setDraft("");
    setRecording(false);
    clearAttachment();
  }

  const canSend = !sending && !recording && (draft.trim() !== "" || attachment !== null);

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
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-muted-foreground flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="text-foreground font-semibold">{comment.authorName}</span>
                    {comment.when ? <span>{comment.when}</span> : null}
                  </p>
                  {comment.body ? (
                    <p className="-mt-1 text-[0.9375rem] leading-snug break-words whitespace-pre-wrap">
                      <MentionText text={comment.body} />
                    </p>
                  ) : null}
                  {comment.photo ? (
                    <CommentPhoto photo={comment.photo} authorName={comment.authorName} />
                  ) : null}
                  {comment.audio ? (
                    <AudioPlayer
                      src={comment.audio.url}
                      durationMs={comment.audio.durationMs}
                      peaks={comment.audio.peaks}
                      label={`Áudio de ${comment.authorName}`}
                    />
                  ) : null}
                  {actions ? (
                    <div className="text-muted-foreground -mt-1 -mb-1 -ml-1 flex items-center gap-2 text-xs font-medium">
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
            if (body === "" && !attachment) return;
            // A gravação do app não passa por input: entra aqui, como se fosse o `audio`.
            if (attachment?.kind === "audio" && attachment.recording) {
              const { blob, ext } = attachment.recording;
              formData.set("audio", blob, `gravacao.${ext}`);
            }
            addOptimistic({
              body,
              photo:
                attachment?.kind === "photo" ? { url: attachment.url, width: 0, height: 0 } : null,
              audio:
                attachment?.kind === "audio"
                  ? {
                      url: attachment.url,
                      durationMs: attachment.durationMs,
                      peaks: attachment.peaks,
                    }
                  : null,
            });
            setDraft("");
            clearAttachment();
            formAction(formData);
          }}
          className="flex flex-col gap-1.5"
        >
          <input type="hidden" name={copy.field} value={target.id} />
          {/* `capture` fora de propósito: no celular o navegador oferece câmera ou galeria. */}
          <input
            ref={photoInputRef}
            type="file"
            name="photo"
            accept="image/*"
            className="sr-only"
            tabIndex={-1}
            aria-label={copy.photoLabel}
            onChange={handlePhotoChange}
          />
          <input
            ref={audioInputRef}
            type="file"
            name="audio"
            accept="audio/*"
            className="sr-only"
            tabIndex={-1}
            aria-label={copy.audioLabel}
            onChange={handleAudioChange}
          />
          <input
            type="hidden"
            name="audioDurationMs"
            value={attachment?.kind === "audio" ? attachment.durationMs : ""}
          />
          <input
            type="hidden"
            name="audioPeaks"
            value={
              attachment?.kind === "audio" && attachment.peaks
                ? JSON.stringify(attachment.peaks)
                : ""
            }
          />
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

          {recording ? (
            <AudioRecorder onDone={finishRecording} onCancel={() => setRecording(false)} />
          ) : attachment?.kind === "photo" ? (
            <AttachmentPreview onRemove={clearAttachment} removeLabel="Tirar foto">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={attachment.url}
                alt="Prévia da foto"
                className="bg-muted max-h-40 max-w-full rounded-lg object-contain"
              />
            </AttachmentPreview>
          ) : attachment?.kind === "audio" ? (
            <AttachmentPreview onRemove={clearAttachment} removeLabel="Tirar áudio">
              <AudioPlayer
                src={attachment.url}
                durationMs={attachment.durationMs}
                peaks={attachment.peaks}
                label="Prévia do áudio"
                className="flex-1"
              />
            </AttachmentPreview>
          ) : null}

          {(mediaError ?? state.fieldErrors?.body ?? state.error) ? (
            <p role="alert" className="text-destructive text-xs">
              {mediaError ?? state.fieldErrors?.body ?? state.error}
            </p>
          ) : null}
          <div className="flex items-center gap-2">
            <Button type="submit" size="lg" className="h-11 px-4" disabled={!canSend}>
              {sending ? "Enviando..." : "Enviar"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-11 px-4"
              onClick={closeForm}
            >
              Cancelar
            </Button>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                disabled={recording}
                aria-label="Anexar foto"
                className={ATTACH_CLASS}
              >
                <Camera className="size-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={startRecording}
                disabled={recording}
                aria-label="Gravar áudio"
                className={ATTACH_CLASS}
              >
                <Mic className="size-5" aria-hidden />
              </button>
            </div>
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

/** A prévia do anexo na caixa, com o "×" pra tirar. */
function AttachmentPreview({
  children,
  onRemove,
  removeLabel,
}: {
  children: React.ReactNode;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="flex items-start gap-2">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className={cn(ATTACH_CLASS, "hover:text-destructive")}
      >
        <X className="size-5" aria-hidden />
      </button>
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
