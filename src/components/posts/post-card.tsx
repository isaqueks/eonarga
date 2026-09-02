import Link from "next/link";

import { mapsSearchUrl } from "@/components/places/maps-buttons";
import { UserAvatar } from "@/components/user-avatar";
import { relativeFromNow } from "@/lib/dates";
import { formatLatLng } from "@/lib/posts";
import type { PostItem } from "@/lib/queries/posts";
import { cn } from "@/lib/utils";

import { PostMenu } from "./post-menu";
import { PostPhoto } from "./post-photo";

/**
 * Um post no feed. Server component: o "há 5 min" é calculado uma vez, no servidor,
 * e não desanda na hidratação. Só a foto em tela cheia e o menu "⋯" são cliente.
 */
export function PostCard({ post, className }: { post: PostItem; className?: string }) {
  const when = relativeFromNow(post.createdAt);

  return (
    <article
      className={cn("border-border bg-card flex flex-col gap-2 rounded-xl border p-3", className)}
    >
      <div className="flex items-start gap-2">
        <UserAvatar name={post.author.name} avatarId={post.author.avatarId} size="md" />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="leading-6 font-semibold">{post.author.name}</p>
          <time dateTime={post.createdAt} className="text-muted-foreground text-xs">
            {when}
          </time>
        </div>
        {post.canDelete ? <PostMenu postId={post.id} /> : null}
      </div>

      <FeedLocation
        place={post.place}
        lat={post.lat}
        lng={post.lng}
        address={post.address}
        className="-mt-1"
      />

      {post.photo ? <PostPhoto photo={post.photo} authorName={post.author.name} /> : null}

      {post.body ? (
        <p className="text-[0.9375rem] leading-snug whitespace-pre-line">{post.body}</p>
      ) : null}
    </article>
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
