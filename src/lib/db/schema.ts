import { relations, sql } from "drizzle-orm";
import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Datas em ISO 8601 UTC, geradas pelo SQLite. updated_at é responsabilidade do app nos UPDATEs.
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const createdAt = () => text("created_at").notNull().default(nowIso);
const updatedAt = () => text("updated_at").notNull().default(nowIso);

export const ROLES = ["admin", "member"] as const;
export const HAS_NARGA = ["yes", "no", "unknown"] as const;
export const PLACE_STATUS = ["active", "archived"] as const;
export const USER_PLACE_STATUS = ["want", "visited"] as const;
// Import relativo de propósito: o drizzle-kit lê este arquivo sem o alias "@/".
import { REACTION_EMOJIS } from "../constants";
export { REACTION_EMOJIS };

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("member"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  lastLoginAt: text("last_login_at"),
  // "Visto por último": atualizado a cada uso (com folga de 5 min), não só no login.
  lastSeenAt: text("last_seen_at"),
  // Id da foto de perfil no storage (src/lib/storage.ts). Null = iniciais.
  avatarId: text("avatar_id"),
  // Campos de zoeira do perfil (docs/08 #25). Admin escreve o que quiser; membro escolhe da lista.
  gender: text("gender"),
  // ng/dL. Membro vai até 1200; admin não tem teto.
  testosterone: integer("testosterone"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = sqliteTable(
  "sessions",
  {
    // sha256 do token que vai no cookie; o token cru nunca é salvo
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: text("expires_at").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const categories = sqliteTable("categories", {
  id: text("id").primaryKey(),
  name: text("name").notNull().unique(),
  slug: text("slug").notNull().unique(),
  emoji: text("emoji").notNull(),
  color: text("color").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const places = sqliteTable(
  "places",
  {
    id: text("id").primaryKey(),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    categoryId: text("category_id")
      .notNull()
      .references(() => categories.id, { onDelete: "restrict" }),
    description: text("description"),
    tips: text("tips"),
    address: text("address"),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    googleMapsUrl: text("google_maps_url"),
    googlePlaceId: text("google_place_id"),
    instagram: text("instagram"),
    website: text("website"),
    priceLevel: integer("price_level"),
    hasNarga: text("has_narga", { enum: HAS_NARGA }).notNull().default("unknown"),
    status: text("status", { enum: PLACE_STATUS }).notNull().default("active"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("places_category_idx").on(t.categoryId),
    index("places_status_idx").on(t.status),
    index("places_latlng_idx").on(t.lat, t.lng),
  ],
);

export const reviews = sqliteTable(
  "reviews",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    // 2..10 = 1,0 a 5,0 em meios pontos
    rating: integer("rating").notNull(),
    verdict: text("verdict").notNull(),
    contentHtml: text("content_html").notNull().default(""),
    visitedAt: text("visited_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // Sem unicidade de propósito (docs/08 #29): cada visita pode virar uma avaliação.
    index("reviews_place_user_idx").on(t.placeId, t.userId),
    index("reviews_user_idx").on(t.userId),
  ],
);

export const userPlaceStatus = sqliteTable(
  "user_place_status",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    status: text("status", { enum: USER_PLACE_STATUS }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.placeId] })],
);

export const reviewReactions = sqliteTable(
  "review_reactions",
  {
    reviewId: text("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    emoji: text("emoji").notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.reviewId, t.userId, t.emoji] })],
);

/**
 * Respostas numa avaliação: thread curta, sem aninhamento (docs/01 — v2).
 * Some junto com a avaliação e com quem escreveu.
 */
export const reviewComments = sqliteTable(
  "review_comments",
  {
    id: text("id").primaryKey(),
    reviewId: text("review_id")
      .notNull()
      .references(() => reviews.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Texto puro, no máximo COMMENT_MAX caracteres (validado na action).
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("review_comments_review_idx").on(t.reviewId)],
);

/**
 * Tags livres do lugar ("aceita pix", "fecha cedo"). A tag já entra normalizada
 * (minúscula, sem acento, só [a-z0-9 ]) — ver src/lib/tags.ts —, então a PK
 * composta já serve de dedupe e o índice em `tag` serve pro filtro do ranking.
 */
export const placeTags = sqliteTable(
  "place_tags",
  {
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    tag: text("tag").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.placeId, t.tag] }), index("place_tags_tag_idx").on(t.tag)],
);

// v2, mas já modelado pra não precisar de migration depois.
export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => places.id, { onDelete: "cascade" }),
    reviewId: text("review_id").references(() => reviews.id, { onDelete: "set null" }),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("photos_place_idx").on(t.placeId)],
);

// Web Push (docs/08 #29). Uma linha por aparelho/navegador que aceitou notificações.
export const pushSubscriptions = sqliteTable(
  "push_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull().unique(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    lastSeenAt: text("last_seen_at"),
  },
  (t) => [index("push_subscriptions_user_idx").on(t.userId)],
);

export const NOTIFICATION_KINDS = ["call", "admin"] as const;

// Histórico do que foi disparado: "Chamar galera pra cá" e avisos do admin.
export const notifications = sqliteTable(
  "notifications",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: NOTIFICATION_KINDS }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    url: text("url"),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    // null = todo mundo
    targetUserId: text("target_user_id").references(() => users.id, { onDelete: "cascade" }),
    sentCount: integer("sent_count").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_created_idx").on(t.createdAt)],
);

/**
 * Post do feed: foto e/ou texto, sempre com quem postou e de onde (docs/01 — Feed).
 *
 * `photo_id` é o id do storage (`src/lib/storage.ts`), sem FK: a imagem do post não é
 * foto de lugar, então não entra em `photos` (que exige `place_id`). Quem apaga o post
 * apaga o arquivo — ver `src/actions/posts.ts`.
 *
 * `lat/lng` são sempre gravados, mesmo com `place_id`: se o lugar for arquivado (ou
 * o `place_id` virar null), o post continua sabendo de onde foi.
 */
export const posts = sqliteTable(
  "posts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Texto puro com quebras de linha, no máximo POST_BODY_MAX (validado na action).
    body: text("body"),
    photoId: text("photo_id"),
    photoWidth: integer("photo_width"),
    photoHeight: integer("photo_height"),
    placeId: text("place_id").references(() => places.id, { onDelete: "set null" }),
    lat: real("lat").notNull(),
    lng: real("lng").notNull(),
    address: text("address"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("posts_created_idx").on(t.createdAt), index("posts_user_idx").on(t.userId)],
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  places: many(places),
  reviews: many(reviews),
  statuses: many(userPlaceStatus),
  comments: many(reviewComments),
  posts: many(posts),
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
  user: one(users, { fields: [sessions.userId], references: [users.id] }),
}));

export const categoriesRelations = relations(categories, ({ many }) => ({
  places: many(places),
}));

export const placesRelations = relations(places, ({ one, many }) => ({
  category: one(categories, { fields: [places.categoryId], references: [categories.id] }),
  creator: one(users, { fields: [places.createdBy], references: [users.id] }),
  reviews: many(reviews),
  statuses: many(userPlaceStatus),
  photos: many(photos),
  tags: many(placeTags),
  posts: many(posts),
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  place: one(places, { fields: [reviews.placeId], references: [places.id] }),
  author: one(users, { fields: [reviews.userId], references: [users.id] }),
  reactions: many(reviewReactions),
  photos: many(photos),
  comments: many(reviewComments),
}));

export const userPlaceStatusRelations = relations(userPlaceStatus, ({ one }) => ({
  user: one(users, { fields: [userPlaceStatus.userId], references: [users.id] }),
  place: one(places, { fields: [userPlaceStatus.placeId], references: [places.id] }),
}));

export const reviewReactionsRelations = relations(reviewReactions, ({ one }) => ({
  review: one(reviews, { fields: [reviewReactions.reviewId], references: [reviews.id] }),
  user: one(users, { fields: [reviewReactions.userId], references: [users.id] }),
}));

export const reviewCommentsRelations = relations(reviewComments, ({ one }) => ({
  review: one(reviews, { fields: [reviewComments.reviewId], references: [reviews.id] }),
  author: one(users, { fields: [reviewComments.userId], references: [users.id] }),
}));

export const placeTagsRelations = relations(placeTags, ({ one }) => ({
  place: one(places, { fields: [placeTags.placeId], references: [places.id] }),
  creator: one(users, { fields: [placeTags.createdBy], references: [users.id] }),
}));

export const postsRelations = relations(posts, ({ one }) => ({
  author: one(users, { fields: [posts.userId], references: [users.id] }),
  place: one(places, { fields: [posts.placeId], references: [places.id] }),
}));

export const photosRelations = relations(photos, ({ one }) => ({
  place: one(places, { fields: [photos.placeId], references: [places.id] }),
  review: one(reviews, { fields: [photos.reviewId], references: [reviews.id] }),
  uploader: one(users, { fields: [photos.uploadedBy], references: [users.id] }),
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Place = typeof places.$inferSelect;
export type NewPlace = typeof places.$inferInsert;
export type Review = typeof reviews.$inferSelect;
export type NewReview = typeof reviews.$inferInsert;
export type UserPlaceStatus = typeof userPlaceStatus.$inferSelect;
export type ReviewReaction = typeof reviewReactions.$inferSelect;
export type Photo = typeof photos.$inferSelect;
export type ReviewComment = typeof reviewComments.$inferSelect;
export type NewReviewComment = typeof reviewComments.$inferInsert;
export type PlaceTag = typeof placeTags.$inferSelect;
export type Post = typeof posts.$inferSelect;
export type NewPost = typeof posts.$inferInsert;
