"use client";

import type { SyntheticEvent } from "react";

import type { PostVideo as PostVideoData } from "@/lib/queries/posts";

/**
 * Um vídeo por vez (docs/08 #40): quando este começa a tocar, pausa qualquer outro
 * `<video>` da página — o feed é uma lista, e dois tocando juntos é barulho.
 */
function pauseOthers(event: SyntheticEvent<HTMLVideoElement>) {
  const me = event.currentTarget;
  for (const other of document.querySelectorAll("video")) {
    if (other !== me && !other.paused) other.pause();
  }
}

/**
 * O vídeo do post: largura do card, proporção reservada antes de carregar e altura
 * limitada a 80% da tela (reel em pé não vira um paredão). Sem autoplay: é feed de
 * amigos, não reel. O `#t=0.001` faz o iPhone mostrar o primeiro quadro em vez de
 * um retângulo preto quando não tem capa. Client component só por causa do `onPlay`.
 */
export function PostVideo({
  video,
  poster,
  authorName,
}: {
  video: PostVideoData;
  /** Capa (a foto do post, quando importado do Instagram). */
  poster: string | null;
  authorName: string;
}) {
  const hasSize = video.width > 0 && video.height > 0;
  const ratio = hasSize ? video.width / video.height : 16 / 9;

  return (
    <div
      className="border-border mx-auto w-full overflow-hidden rounded-lg border bg-black"
      style={{
        aspectRatio: `${hasSize ? video.width : 16} / ${hasSize ? video.height : 9}`,
        maxWidth: `min(100%, calc(80vh * ${ratio.toFixed(4)}))`,
      }}
    >
      <video
        src={`${video.url}#t=0.001`}
        poster={poster ?? undefined}
        controls
        playsInline
        preload="metadata"
        onPlay={pauseOthers}
        aria-label={`Vídeo de ${authorName}`}
        className="h-full w-full object-contain"
      />
    </div>
  );
}
