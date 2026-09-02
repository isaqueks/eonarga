import { hash } from "@node-rs/argon2";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "./client";
import { categories, users } from "./schema";

export const DEFAULT_CATEGORIES = [
  { slug: "restaurante", name: "Restaurante", emoji: "🍽️", color: "#f4b942" },
  { slug: "bar", name: "Bar", emoji: "🍺", color: "#e0894a" },
  { slug: "cafe", name: "Café", emoji: "☕", color: "#a97c50" },
  { slug: "lanchonete", name: "Lanchonete", emoji: "🍔", color: "#e5533d" },
  { slug: "sebo", name: "Sebo", emoji: "📚", color: "#8fd3b0" },
  { slug: "livraria", name: "Livraria", emoji: "📖", color: "#5cb8a6" },
  { slug: "loja", name: "Loja", emoji: "🛍️", color: "#c58ad9" },
  { slug: "tabacaria", name: "Tabacaria", emoji: "💨", color: "#8a9bb8" },
  { slug: "outro", name: "Outro", emoji: "📍", color: "#9aa39e" },
] as const;

export async function seedCategories() {
  let created = 0;
  for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
    const res = await db
      .insert(categories)
      .values({ id: nanoid(12), ...c, sortOrder: i })
      .onConflictDoNothing({ target: categories.slug });
    created += res.rowsAffected;
  }
  return created;
}

/** Cria o primeiro admin a partir de ADMIN_* se ainda não existir nenhum admin. */
export async function seedAdmin(env: NodeJS.ProcessEnv = process.env) {
  const existing = await db.query.users.findFirst({ where: eq(users.role, "admin") });
  if (existing) return { created: false as const, reason: "admin já existe" };

  const name = env.ADMIN_NAME?.trim();
  const email = env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.ADMIN_PASSWORD;
  if (!name || !email || !password) {
    return {
      created: false as const,
      reason: "ADMIN_NAME, ADMIN_EMAIL e ADMIN_PASSWORD não definidos",
    };
  }
  if (password.length < 8) {
    return { created: false as const, reason: "ADMIN_PASSWORD precisa de pelo menos 8 caracteres" };
  }

  await db.insert(users).values({
    id: nanoid(12),
    name,
    email,
    passwordHash: await hash(password),
    role: "admin",
    mustChangePassword: false,
  });
  return { created: true as const, email };
}

export async function seedAll() {
  const cats = await seedCategories();
  const admin = await seedAdmin();
  return { categoriesCreated: cats, admin };
}
