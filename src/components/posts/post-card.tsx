import Link from "next/link";

import { CommentThread, type CommentView } from "@/components/comments/comment-thread";
import { MentionText } from "@/components/mentions/mention-text";
import { mapsSearchUrl } from "@/components/places/maps-buttons";
import { ReactionBar } from "@/components/reviews/reaction-bar";
import { UserAvatar } from "@/components/user-avatar";
import { relativeFromNow } from "@/lib/dates";
import { sourceProvider } from "@/lib/import-links";
import { formatLatLng } from "@/lib/posts";
import type { PostFlopRef, PostItem } from "@/lib/queries/posts";
import { cn } from "@/lib/utils";

import { AudioPlayer } from "./audio-player";
import { PostMenu } from "./post-menu";
import { PostPhoto } from "./post-photo";
import { PostVideo } from "./post-video";

/** Quem "fala" no aviso de flop: o app, com o rosto do cachorro no lugar do avatar. */
const APP_NAME = "E o narga?";
const APP_FACE = "/icons/logo-face.png";

/**
 * Um post no feed. Server component: o "há 5 min" é calculado uma vez, no servidor,
 * e não desanda na hidratação. Só a foto em tela cheia, o menu "⋯", as reações e
 * a thread de comentários são cliente.
 *
 * O aviso de flop (docs/08 #50) é um post como outro qualquer no banco, mas no card
 * quem assina é o app: rosto do cachorro, "E o narga?", o texto "O post de Fulano
 * flopou 200%" e uma prévia do post que flopou, sem a linha "de onde".
 */
export function PostCard({ post, className }: { post: PostItem; className?: string }) {
  const when = relativeFromNow(post.createdAt);
  const flop = post.flop;
  // O "há x" de cada comentário sai daqui, do servidor, pelo mesmo motivo do de cima.
  const comments: CommentView[] = post.comments.map((comment) => ({
    id: comment.id,
    body: comment.body,
    photo: comment.photo
      ? { url: comment.photo.url, width: comment.photo.width, height: comment.photo.height }
      : null,
    audio: comment.audio
      ? {
          url: comment.audio.url,
          durationMs: comment.audio.durationMs,
          peaks: comment.audio.peaks,
        }
      : null,
    when: relativeFromNow(comment.createdAt),
    authorName: comment.author.name,
    authorAvatarId: comment.author.avatarId,
    canDelete: comment.canDelete,
    likes: comment.likes,
    likedByMe: comment.likedByMe,
  }));

  return (
    <article
      // Âncora do push "fulano comentou no seu post" (`/feed#post-<id>`); o scroll-mt
      // desconta o cabeçalho fixo.
      id={`post-${post.id}`}
      className={cn(
        "border-border bg-card flex scroll-mt-20 flex-col gap-2 rounded-xl border px-2.5 py-3",
        className,
      )}
    >
      <div className="flex items-start gap-2">
        {flop ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={APP_FACE}
            alt=""
            width={40}
            height={40}
            loading="lazy"
            decoding="async"
            className="bg-muted size-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <UserAvatar name={post.author.name} avatarId={post.author.avatarId} size="md" />
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="leading-6 font-semibold">{flop ? APP_NAME : post.author.name}</p>
          <time dateTime={post.createdAt} className="text-muted-foreground text-xs">
            {when}
          </time>
        </div>
        {post.canDelete ? <PostMenu postId={post.id} /> : null}
      </div>

      {flop ? null : (
        <FeedLocation
          place={post.place}
          lat={post.lat}
          lng={post.lng}
          address={post.address}
          className="-mt-1"
        />
      )}

      {post.source ? <SourceLine url={post.source.url} author={post.source.author} /> : null}

      {post.video ? (
        <PostVideo
          video={post.video}
          poster={post.photo?.url ?? null}
          authorName={post.author.name}
        />
      ) : post.photo ? (
        <PostPhoto photo={post.photo} authorName={post.author.name} />
      ) : null}

      {post.audio ? (
        <AudioPlayer
          src={post.audio.url}
          durationMs={post.audio.durationMs}
          peaks={post.audio.peaks}
          label={`Áudio de ${post.author.name}`}
        />
      ) : null}

      {flop ? (
        <>
          <p className="text-[0.9375rem] leading-snug font-medium">
            <span aria-hidden>📉 </span>
            {post.body}
          </p>
          <FlopQuote flop={flop} />
        </>
      ) : post.body ? (
        <p className="text-[0.9375rem] leading-snug whitespace-pre-line">
          <MentionText text={post.body} />
        </p>
      ) : null}

      <ReactionBar
        target={{ type: "post", id: post.id }}
        reactions={post.reactions}
        className="pt-1"
      />

      <CommentThread
        target={{ type: "post", id: post.id }}
        comments={comments}
        className="border-border/60 border-t pt-2"
      />
    </article>
  );
}

/** O que o post que flopou tinha, quando não tinha texto pra citar. */
const FLOP_MEDIA_LABEL: Record<NonNullable<PostFlopRef["media"]>, string> = {
  photo: "uma foto",
  video: "um vídeo",
  audio: "um áudio",
};

/**
 * A prévia do post que flopou, dentro do aviso: miniatura (quando tem), quem postou e o
 * começo do texto, tudo linkando pra âncora do post no feed. A miniatura é decorativa
 * de propósito (`alt=""`): a "Foto de Fulano" é a do card original.
 */
function FlopQuote({ flop }: { flop: PostFlopRef }) {
  return (
    <Link
      href={`/feed#post-${flop.postId}`}
      className="border-border bg-muted/40 hover:bg-muted/70 flex items-center gap-2 rounded-lg border p-2 text-xs"
    >
      {flop.thumbUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={flop.thumbUrl}
          alt=""
          width={40}
          height={40}
          loading="lazy"
          decoding="async"
          className="bg-muted size-10 shrink-0 rounded object-cover"
        />
      ) : (
        <span className="bg-muted flex size-10 shrink-0 items-center justify-center rounded text-lg">
          <span aria-hidden>
            {flop.media === "video" ? "🎬" : flop.media === "audio" ? "🎤" : "💬"}
          </span>
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{flop.authorName}</span>
        {flop.excerpt ? (
          <span className="text-muted-foreground line-clamp-2">“{flop.excerpt}”</span>
        ) : (
          <span className="text-muted-foreground block">
            {flop.media ? `mandou ${FLOP_MEDIA_LABEL[flop.media]}` : "postou"}
          </span>
        )}
      </span>
    </Link>
  );
}

/** "📸 @perfil no Instagram" / "🎵 @perfil no TikTok": de onde o post importado veio. */
function SourceLine({ url, author }: { url: string; author: string | null }) {
  const provider = sourceProvider(url);
  return (
    <p className="text-muted-foreground -mt-1 text-xs leading-5">
      <span aria-hidden>{provider.emoji} </span>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-foreground hover:underline"
      >
        {author ? `@${author} no ${provider.name}` : `do ${provider.name}`}
      </a>
    </p>
  );
}

/**
 * A linha "de onde": o lugar cadastrado (link pra ficha) ou o endereço solto
 * (link pro Maps, em aba nova). Sem endereço, mostra a coordenada mesmo.
 */
export function FeedLocation({
  place,
  lat,
  lng,
  address,
  className,
}: {
  /** O lugar cadastrado, quando o post (ou a avaliação) é de um. */
  place: { slug: string; name: string; emoji: string } | null;
  /** Coordenada do post. Sem lugar, é ela que vira o link do Maps. */
  lat?: number;
  lng?: number;
  address?: string | null;
  className?: string;
}) {
  const hasPoint = Number.isFinite(lat) && Number.isFinite(lng);
  if (!place && !hasPoint) return null;

  return (
    <p className={cn("text-muted-foreground text-xs leading-5", className)}>
      <span aria-hidden>📍 </span>
      {place ? (
        <>
          no{" "}
          <Link
            href={`/lugares/${place.slug}`}
            className="text-foreground font-semibold hover:underline"
          >
            <span aria-hidden>{place.emoji} </span>
            {place.name}
          </Link>
        </>
      ) : (
        <a
          href={mapsSearchUrl(lat!, lng!)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground hover:underline"
        >
          {address || formatLatLng(lat!, lng!)}
        </a>
      )}
    </p>
  );
}
