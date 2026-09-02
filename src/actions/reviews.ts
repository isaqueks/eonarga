"use server";

import { and, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { field, fieldErrorsFrom, type FormState } from "@/actions/form-state";
import { assertUser } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { places, reviewReactions, reviews, userPlaceStatus } from "@/lib/db/schema";
import {
  CONTENT_TEXT_MAX,
  CONTENT_TOO_LONG,
  isReactionEmoji,
  reviewInputSchema,
} from "@/lib/reviews";
import { htmlToText, sanitizeReviewHtml } from "@/lib/sanitize";

const PLACE_NOT_FOUND = "Lugar não encontrado.";
const PLACE_ARCHIVED = "Esse lugar está arquivado.";
const REVIEW_NOT_FOUND = "Avaliação não encontrada.";
const NOT_YOURS = "Você só apaga a sua avaliação.";
const BAD_EMOJI = "Esse emoji não existe por aqui.";

/** Ficha do lugar + as listas onde a nota aparece. */
function revalidateReviewSurfaces(slug: string) {
  revalidatePath(`/lugares/${slug}`);
  revalidatePath("/");
  revalidatePath("/perfil");
  revalidatePath("/role");
  revalidatePath("/mapa");
}

/** A avaliação com o slug do lugar junto (pra saber o que revalidar). */
async function findReviewWithPlace(reviewId: string) {
  const rows = await db
    .select({
      id: reviews.id,
      userId: reviews.userId,
      placeId: reviews.placeId,
      slug: places.slug,
    })
    .from(reviews)
    .innerJoin(places, eq(places.id, reviews.placeId))
    .where(eq(reviews.id, reviewId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Cria ou atualiza a minha avaliação do lugar. Uma por pessoa por lugar:
 * a nota é "a sua opinião atual", não um histórico de visitas (docs/01).
 */
export async function upsertReview(_prev: FormState, formData: FormData): Promise<FormState> {
  const { user } = await assertUser();

  const parsed = reviewInputSchema.safeParse({
    placeId: field(formData, "placeId"),
    rating: field(formData, "rating"),
    verdict: field(formData, "verdict"),
    contentHtml: field(formData, "contentHtml"),
    visitedAt: field(formData, "visitedAt"),
  });
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const data = parsed.data;

  const place = await db.query.places.findFirst({
    where: eq(places.id, data.placeId),
    columns: { id: true, slug: true, status: true },
  });
  if (!place) return { ok: false, error: PLACE_NOT_FOUND };
  if (place.status !== "active") return { ok: false, error: PLACE_ARCHIVED };

  // Limpa antes de medir: o que conta é o texto que vai aparecer na tela.
  const contentHtml = sanitizeReviewHtml(data.contentHtml);
  if (htmlToText(contentHtml).length > CONTENT_TEXT_MAX) {
    return { ok: false, fieldErrors: { contentHtml: CONTENT_TOO_LONG } };
  }

  const now = new Date().toISOString();

  const existing = await db.query.reviews.findFirst({
    where: and(eq(reviews.placeId, place.id), eq(reviews.userId, user.id)),
    columns: { id: true },
  });

  if (existing) {
    await db
      .update(reviews)
      .set({
        rating: data.rating,
        verdict: data.verdict,
        contentHtml,
        visitedAt: data.visitedAt,
        updatedAt: now,
      })
      .where(eq(reviews.id, existing.id));
  } else {
    await db.insert(reviews).values({
      id: nanoid(12),
      placeId: place.id,
      userId: user.id,
      rating: data.rating,
      verdict: data.verdict,
      contentHtml,
      visitedAt: data.visitedAt,
    });
  }

  // Avaliar marca "já fui" (docs/01 — Status por lugar).
  await db
    .insert(userPlaceStatus)
    .values({ userId: user.id, placeId: place.id, status: "visited", updatedAt: now })
    .onConflictDoUpdate({
      target: [userPlaceStatus.userId, userPlaceStatus.placeId],
      set: { status: "visited", updatedAt: now },
    });

  revalidateReviewSurfaces(place.slug);
  redirect(`/lugares/${place.slug}#avaliacoes`);
}

/**
 * Apaga a avaliação. Dono ou admin (docs/05 — Permissões). As reações vão junto
 * pelo `on delete cascade`; o "já fui" fica, porque a pessoa foi mesmo.
 */
export async function deleteReview(reviewId: string): Promise<FormState> {
  const { user } = await assertUser();

  const review = await findReviewWithPlace(reviewId);
  if (!review) return { ok: false, error: REVIEW_NOT_FOUND };
  if (review.userId !== user.id && user.role !== "admin") {
    return { ok: false, error: NOT_YOURS };
  }

  await db.delete(reviews).where(eq(reviews.id, review.id));

  revalidatePath(`/lugares/${review.slug}`);
  revalidatePath("/");
  revalidatePath("/perfil");
  return { ok: true };
}

/** Liga/desliga uma reação minha na avaliação e devolve o estado novo daquele emoji. */
export async function toggleReaction(
  reviewId: string,
  emoji: string,
): Promise<FormState & { reacted?: boolean; count?: number }> {
  const { user } = await assertUser();

  if (!isReactionEmoji(emoji)) return { ok: false, error: BAD_EMOJI };

  const review = await findReviewWithPlace(reviewId);
  if (!review) return { ok: false, error: REVIEW_NOT_FOUND };

  const mine = and(
    eq(reviewReactions.reviewId, review.id),
    eq(reviewReactions.userId, user.id),
    eq(reviewReactions.emoji, emoji),
  );

  const existing = await db.query.reviewReactions.findFirst({ where: mine });

  if (existing) {
    await db.delete(reviewReactions).where(mine);
  } else {
    await db
      .insert(reviewReactions)
      .values({ reviewId: review.id, userId: user.id, emoji })
      .onConflictDoNothing();
  }

  const counted = await db
    .select({ count: sql<number>`count(*)` })
    .from(reviewReactions)
    .where(and(eq(reviewReactions.reviewId, review.id), eq(reviewReactions.emoji, emoji)));

  revalidatePath(`/lugares/${review.slug}`);
  return { ok: true, reacted: !existing, count: Number(counted[0]?.count ?? 0) };
}
