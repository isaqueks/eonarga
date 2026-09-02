import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Datas em ISO 8601 UTC, geradas pelo SQLite. updated_at é responsabilidade do app nos UPDATEs.
const nowIso = sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
const createdAt = () => text("created_at").notNull().default(nowIso);
const updatedAt = () => text("updated_at").notNull().default(nowIso);

export const ROLES = ["admin", "member"] as const;
export const HAS_NARGA = ["yes", "no", "unknown"] as const;
export const PLACE_STATUS = ["active", "archived"] as const;
export const USER_PLACE_STATUS = ["want", "visited"] as const;
export const REACTION_EMOJIS = ["👍", "😂", "🔥", "🤮", "💨"] as const;

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: text("role", { enum: ROLES }).notNull().default("member"),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(false),
  lastLoginAt: text("last_login_at"),
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
    uniqueIndex("reviews_place_user_uq").on(t.placeId, t.userId),
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

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(sessions),
  places: many(places),
  reviews: many(reviews),
  statuses: many(userPlaceStatus),
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
}));

export const reviewsRelations = relations(reviews, ({ one, many }) => ({
  place: one(places, { fields: [reviews.placeId], references: [places.id] }),
  author: one(users, { fields: [reviews.userId], references: [users.id] }),
  reactions: many(reviewReactions),
  photos: many(photos),
}));

export const userPlaceStatusRelations = relations(userPlaceStatus, ({ one }) => ({
  user: one(users, { fields: [userPlaceStatus.userId], references: [users.id] }),
  place: one(places, { fields: [userPlaceStatus.placeId], references: [places.id] }),
}));

export const reviewReactionsRelations = relations(reviewReactions, ({ one }) => ({
  review: one(reviews, { fields: [reviewReactions.reviewId], references: [reviews.id] }),
  user: one(users, { fields: [reviewReactions.userId], references: [users.id] }),
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
