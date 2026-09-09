import { asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

import { REACTION_EMOJIS } from "@/lib/constants";
import { db } from "@/lib/db/client";
import {
  categories,
  places,
  postCommentLikes,
  postComments,
  postReactions,
  posts,
  users,
} from "@/lib/db/schema";
import { loadCommentLikes } from "@/lib/queries/comment-likes";
import { previewText } from "@/lib/posts";
import type { PersonRef } from "@/lib/queries/places";
import { toMediaAudio, toMediaPhoto, type MediaAudio, type MediaPhoto } from "@/lib/queries/media";
import type { ReactionSummary } from "@/lib/queries/reviews";
import { isVideoExt, type VideoExt } from "@/lib/video-storage";

/** A foto do post: variante grande (até 1600 px) e a quadrada de 400 px. */
export type PostPhoto = MediaPhoto;

/** O vídeo do post; com vídeo, `photo` (se houver) é a capa. */
export interface PostVideo {
  id: string;
  /** `/api/videos/<id>.<ext>`, com Range. */
  url: string;
  ext: VideoExt;
  width: number;
  height: number;
}

/** O áudio do post (docs/08 #47), pro player do card. */
export type PostAudio = MediaAudio;

/** O lugar cadastrado de onde o post saiu, quando foi de um. */
export interface PostPlaceRef {
  id: string;
  slug: string;
  name: string;
  /** Emoji da categoria do lugar. */
  emoji: string;
}

/**
 * O aviso "O post de Fulano flopou 200%" (docs/08 #50) aponta pro post que flopou: o
 * card mostra uma prévia dele (autor, começo do texto, miniatura) com link pra âncora.
 */
export interface PostFlopRef {
  postId: string;
  authorName: string;
  /** Começo do texto do post que flopou, ou null se ele era só mídia. */
  excerpt: string | null;
  /** Miniatura da foto (ou da capa do vídeo), quando tinha. */
  thumbUrl: string | null;
  /** O que o post que flopou tinha além de texto. */
  media: "photo" | "video" | "audio" | null;
}

/** Quanto do texto do post que flopou cabe na prévia do aviso. */
export const FLOP_EXCERPT_MAX = 120;

/** Um comentário no post, pronto pro card. */
export interface PostCommentItem {
  id: string;
  /** Texto puro; vazio quando o comentário é só foto ou só áudio (docs/08 #52). */
  body: string;
  /** A foto do comentário, quando tem. */
  photo: MediaPhoto | null;
  /** O áudio do comentário, quando tem. */
  audio: MediaAudio | null;
  createdAt: string;
  author: PersonRef;
  /** Quem comentou, quem postou (é a thread do post) ou admin (docs/05 — Permissões). */
  canDelete: boolean;
  /** Quantas curtidas e se quem olha curtiu. */
  likes: number;
  likedByMe: boolean;
}

export interface PostItem {
  id: string;
  body: string | null;
  photo: PostPhoto | null;
  video: PostVideo | null;
  audio: PostAudio | null;
  place: PostPlaceRef | null;
  lat: number;
  lng: number;
  address: string | null;
  /** Post importado do Instagram: link e perfil de origem. */
  source: { url: string; author: string | null } | null;
  /** Aviso de flop: qual post flopou. Null num post normal. */
  flop: PostFlopRef | null;
  author: PersonRef;
  createdAt: string;
  /** Autor do post ou admin (docs/05). */
  canDelete: boolean;
  /** Só emojis com pelo menos uma reação, na ordem de `REACTION_EMOJIS`. */
  reactions: ReactionSummary[];
  /** Comentários do mais antigo pro mais novo. */
  comments: PostCommentItem[];
}

export interface PostViewer {
  id: string;
  role: "admin" | "member";
}

export const POSTS_DEFAULT_LIMIT = 30;
const POSTS_MAX_LIMIT = 200;

export interface ListPostsOptions {
  limit?: number;
  /** Cursor ISO: só posts mais antigos que isso. */
  before?: string;
}

// O post que flopou (e quem postou), pro aviso de flop desenhar a prévia dele.
const flopOf = alias(posts, "flop_of");
const flopOfAuthor = alias(users, "flop_of_author");

/**
 * Uma query só, com join em users e left join em places/categories (e no post que
 * flopou, quando é um aviso) — o card do feed precisa de tudo isso e nada mais. Sem N+1.
 *
 * Post de lugar arquivado continua aparecendo: o post é da pessoa, não do lugar (o
 * `place_id` só vira null se o lugar for apagado de verdade).
 */
const columns = {
  id: posts.id,
  body: posts.body,
  photoId: posts.photoId,
  photoWidth: posts.photoWidth,
  photoHeight: posts.photoHeight,
  videoId: posts.videoId,
  videoExt: posts.videoExt,
  videoWidth: posts.videoWidth,
  videoHeight: posts.videoHeight,
  audioId: posts.audioId,
  audioExt: posts.audioExt,
  audioDurationMs: posts.audioDurationMs,
  audioPeaks: posts.audioPeaks,
  lat: posts.lat,
  lng: posts.lng,
  address: posts.address,
  sourceUrl: posts.sourceUrl,
  sourceAuthor: posts.sourceAuthor,
  flopOfPostId: posts.flopOfPostId,
  flopOfBody: flopOf.body,
  flopOfPhotoId: flopOf.photoId,
  flopOfVideoId: flopOf.videoId,
  flopOfAudioId: flopOf.audioId,
  flopOfAuthorName: flopOfAuthor.name,
  createdAt: posts.createdAt,
  placeId: places.id,
  placeSlug: places.slug,
  placeName: places.name,
  placeEmoji: categories.emoji,
  authorId: users.id,
  authorName: users.name,
  authorAvatarId: users.avatarId,
};

type PostRow = {
  id: string;
  body: string | null;
  photoId: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
  videoId: string | null;
  videoExt: string | null;
  videoWidth: number | null;
  videoHeight: number | null;
  audioId: string | null;
  audioExt: string | null;
  audioDurationMs: number | null;
  audioPeaks: string | null;
  lat: number;
  lng: number;
  address: string | null;
  sourceUrl: string | null;
  sourceAuthor: string | null;
  flopOfPostId: string | null;
  flopOfBody: string | null;
  flopOfPhotoId: string | null;
  flopOfVideoId: string | null;
  flopOfAudioId: string | null;
  flopOfAuthorName: string | null;
  createdAt: string;
  placeId: string | null;
  placeSlug: string | null;
  placeName: string | null;
  placeEmoji: string | null;
  authorId: string;
  authorName: string;
  authorAvatarId: string | null;
};

/** A prévia do post que flopou; o aviso sem original (não deveria existir) fica genérico. */
function toFlop(row: PostRow): PostFlopRef | null {
  if (!row.flopOfPostId) return null;
  return {
    postId: row.flopOfPostId,
    authorName: row.flopOfAuthorName ?? row.authorName,
    excerpt: row.flopOfBody ? previewText(row.flopOfBody, FLOP_EXCERPT_MAX).text : null,
    thumbUrl: row.flopOfPhotoId ? `/api/uploads/${row.flopOfPhotoId}?v=thumb` : null,
    media: row.flopOfVideoId
      ? "video"
      : row.flopOfPhotoId
        ? "photo"
        : row.flopOfAudioId
          ? "audio"
          : null,
  };
}

const EMOJI_ORDER = new Map<string, number>(REACTION_EMOJIS.map((emoji, i) => [emoji, i]));

/**
 * Reações de vários posts de uma vez, agrupadas por emoji, com o "eu já reagi" de quem
 * está olhando. Sem viewer (link público, por exemplo) ninguém "já reagiu".
 */
async function loadReactions(postIds: string[], viewerId: string | null) {
  const byPost = new Map<string, ReactionSummary[]>();
  if (postIds.length === 0) return byPost;

  const rows = await db
    .select({
      postId: postReactions.postId,
      emoji: postReactions.emoji,
      count: sql<number>`count(*)`,
      mine: viewerId
        ? sql<number>`sum(case when ${postReactions.userId} = ${viewerId} then 1 else 0 end)`
        : sql<number>`0`,
    })
    .from(postReactions)
    .where(inArray(postReactions.postId, postIds))
    .groupBy(postReactions.postId, postReactions.emoji);

  for (const row of rows) {
    // Emoji que saiu da lista fixa (ou nunca esteve nela) não aparece.
    if (!EMOJI_ORDER.has(row.emoji)) continue;
    const summary: ReactionSummary = {
      emoji: row.emoji,
      count: Number(row.count),
      mine: Number(row.mine) > 0,
    };
    const list = byPost.get(row.postId);
    if (list) list.push(summary);
    else byPost.set(row.postId, [summary]);
  }

  for (const list of byPost.values()) {
    list.sort((a, b) => (EMOJI_ORDER.get(a.emoji) ?? 0) - (EMOJI_ORDER.get(b.emoji) ?? 0));
  }

  return byPost;
}

/**
 * Comentários de vários posts de uma vez, em ordem cronológica, com o autor do post
 * junto pra resolver o `canDelete` sem outra ida ao banco.
 */
async function loadComments(postIds: string[], viewer: PostViewer | null) {
  const byPost = new Map<string, PostCommentItem[]>();
  if (postIds.length === 0) return byPost;

  const rows = await db
    .select({
      id: postComments.id,
      postId: postComments.postId,
      body: postComments.body,
      photoId: postComments.photoId,
      photoWidth: postComments.photoWidth,
      photoHeight: postComments.photoHeight,
      audioId: postComments.audioId,
      audioExt: postComments.audioExt,
      audioDurationMs: postComments.audioDurationMs,
      audioPeaks: postComments.audioPeaks,
      createdAt: postComments.createdAt,
      authorId: users.id,
      authorName: users.name,
      authorAvatarId: users.avatarId,
      postAuthorId: posts.userId,
    })
    .from(postComments)
    .innerJoin(users, eq(users.id, postComments.userId))
    .innerJoin(posts, eq(posts.id, postComments.postId))
    .where(inArray(postComments.postId, postIds))
    // Empate no milissegundo desempatado pelo id, pra a ordem não dançar entre renders.
    .orderBy(asc(postComments.createdAt), asc(postComments.id));

  const likes = await loadCommentLikes(
    postCommentLikes,
    rows.map((row) => row.id),
    viewer?.id ?? null,
  );

  for (const row of rows) {
    const liked = likes.get(row.id);
    const item: PostCommentItem = {
      id: row.id,
      body: row.body,
      photo: toMediaPhoto(row),
      audio: toMediaAudio(row),
      createdAt: row.createdAt,
      author: { id: row.authorId, name: row.authorName, avatarId: row.authorAvatarId },
      canDelete:
        viewer !== null &&
        (viewer.role === "admin" || viewer.id === row.authorId || viewer.id === row.postAuthorId),
      likes: liked?.count ?? 0,
      likedByMe: liked?.mine ?? false,
    };
    const list = byPost.get(row.postId);
    if (list) list.push(item);
    else byPost.set(row.postId, [item]);
  }

  return byPost;
}

function toItem(
  row: PostRow,
  viewer: PostViewer | null,
  reactions: ReactionSummary[],
  comments: PostCommentItem[],
): PostItem {
  return {
    id: row.id,
    body: row.body,
    photo: toMediaPhoto(row),
    video:
      row.videoId && row.videoExt && isVideoExt(row.videoExt)
        ? {
            id: row.videoId,
            url: `/api/videos/${row.videoId}.${row.videoExt}`,
            ext: row.videoExt,
            width: row.videoWidth ?? 0,
            height: row.videoHeight ?? 0,
          }
        : null,
    audio: toMediaAudio(row),
    place:
      row.placeId && row.placeSlug && row.placeName
        ? {
            id: row.placeId,
            slug: row.placeSlug,
            name: row.placeName,
            emoji: row.placeEmoji ?? "📍",
          }
        : null,
    lat: row.lat,
    lng: row.lng,
    address: row.address,
    source: row.sourceUrl ? { url: row.sourceUrl, author: row.sourceAuthor } : null,
    flop: toFlop(row),
    author: { id: row.authorId, name: row.authorName, avatarId: row.authorAvatarId },
    createdAt: row.createdAt,
    canDelete: viewer !== null && (viewer.role === "admin" || viewer.id === row.authorId),
    reactions,
    comments,
  };
}

/** Completa as linhas com reações e comentários: duas queries pra lista inteira. */
async function hydrate(rows: PostRow[], viewer: PostViewer | null): Promise<PostItem[]> {
  const ids = rows.map((row) => row.id);
  const [reactions, comments] = await Promise.all([
    loadReactions(ids, viewer?.id ?? null),
    loadComments(ids, viewer),
  ]);
  return rows.map((row) =>
    toItem(row, viewer, reactions.get(row.id) ?? [], comments.get(row.id) ?? []),
  );
}

/** Posts do grupo, do mais novo pro mais velho. */
export async function listPosts(
  viewer: PostViewer | null,
  opts: ListPostsOptions = {},
): Promise<PostItem[]> {
  const limit = Math.min(
    Math.max(Math.trunc(opts.limit ?? POSTS_DEFAULT_LIMIT), 1),
    POSTS_MAX_LIMIT,
  );
  const before = opts.before?.trim() || undefined;

  const rows = (await db
    .select(columns)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .leftJoin(places, eq(places.id, posts.placeId))
    .leftJoin(categories, eq(categories.id, places.categoryId))
    .leftJoin(flopOf, eq(flopOf.id, posts.flopOfPostId))
    .leftJoin(flopOfAuthor, eq(flopOfAuthor.id, flopOf.userId))
    .where(before ? lt(posts.createdAt, before) : undefined)
    // Dois posts no mesmo milissegundo empatam no createdAt; o id desempata.
    .orderBy(desc(posts.createdAt), desc(posts.id))
    .limit(limit)) as PostRow[];

  return hydrate(rows, viewer);
}

/** Um post pelo id (usado pelo delete e por quem precisa conferir permissão). */
export async function getPost(id: string, viewer: PostViewer | null): Promise<PostItem | null> {
  if (typeof id !== "string" || id === "") return null;

  const rows = (await db
    .select(columns)
    .from(posts)
    .innerJoin(users, eq(users.id, posts.userId))
    .leftJoin(places, eq(places.id, posts.placeId))
    .leftJoin(categories, eq(categories.id, places.categoryId))
    .leftJoin(flopOf, eq(flopOf.id, posts.flopOfPostId))
    .leftJoin(flopOfAuthor, eq(flopOfAuthor.id, flopOf.userId))
    .where(eq(posts.id, id))
    .limit(1)) as PostRow[];

  const [item] = await hydrate(rows, viewer);
  return item ?? null;
}

/** O que a tela de postar precisa saber de cada lugar ativo pra lista e pro "você tá no X?". */
export interface PostPlaceOption {
  id: string;
  slug: string;
  name: string;
  emoji: string;
  lat: number;
  lng: number;
  address: string | null;
}

/** Lugares ativos em ordem alfabética. O cliente reordena por distância quando tem GPS. */
export async function listPostPlaceOptions(): Promise<PostPlaceOption[]> {
  return db
    .select({
      id: places.id,
      slug: places.slug,
      name: places.name,
      emoji: categories.emoji,
      lat: places.lat,
      lng: places.lng,
      address: places.address,
    })
    .from(places)
    .innerJoin(categories, eq(categories.id, places.categoryId))
    .where(eq(places.status, "active"))
    .orderBy(asc(places.name));
}
