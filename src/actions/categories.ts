"use server";

import { asc, count, eq, like, max } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { field, fieldErrorsFrom, type FormState } from "@/actions/form-state";
import { assertAdmin } from "@/lib/auth/guards";
import { db } from "@/lib/db/client";
import { categories, places } from "@/lib/db/schema";
import { slugify } from "@/lib/slug";

const ADMIN_PATH = "/admin/categorias";
const NOT_FOUND = "Categoria não encontrada.";
const DUPLICATE_NAME = "Já tem uma categoria com esse nome.";

const categorySchema = z.object({
  name: z.string().trim().min(2, "Nome curto demais").max(30, "Nome comprido demais (máximo 30)"),
  emoji: z
    .string()
    .trim()
    .refine((v) => {
      const points = [...v].length;
      return points >= 1 && points <= 4;
    }, "Bota um emoji (1 a 4 caracteres)"),
  color: z
    .string()
    .trim()
    .toLowerCase()
    .refine((v) => /^#[0-9a-f]{6}$/.test(v), "Cor tem que ser hex, tipo #f4b942"),
});

function readCategoryForm(formData: FormData) {
  return {
    name: field(formData, "name"),
    emoji: field(formData, "emoji"),
    color: field(formData, "color"),
  };
}

function revalidateCategories() {
  revalidatePath(ADMIN_PATH);
  revalidatePath("/ranking");
  revalidatePath("/mapa");
}

/** Slug livre: "sebo", "sebo-2", ... O slug nunca muda depois de criado. */
async function nextFreeSlug(base: string): Promise<string> {
  const rows = await db
    .select({ slug: categories.slug })
    .from(categories)
    .where(like(categories.slug, `${base}%`));
  const taken = new Set(rows.map((r) => r.slug));

  if (!taken.has(base)) return base;
  for (let i = 2; i <= 500; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function createCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();

  const parsed = categorySchema.safeParse(readCategoryForm(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { name, emoji, color } = parsed.data;

  const clash = await db.query.categories.findFirst({
    where: eq(categories.name, name),
    columns: { id: true },
  });
  if (clash) return { ok: false, fieldErrors: { name: DUPLICATE_NAME } };

  const [{ value: maiorOrdem }] = await db
    .select({ value: max(categories.sortOrder) })
    .from(categories);

  try {
    await db.insert(categories).values({
      id: nanoid(12),
      name,
      slug: await nextFreeSlug(slugify(name)),
      emoji,
      color,
      sortOrder: (maiorOrdem ?? -1) + 1,
    });
  } catch {
    // Índice único de nome/slug: outra aba criou a mesma categoria.
    return { ok: false, fieldErrors: { name: DUPLICATE_NAME } };
  }

  revalidateCategories();
  return { ok: true };
}

export async function updateCategory(_prev: FormState, formData: FormData): Promise<FormState> {
  await assertAdmin();

  const id = field(formData, "id").trim();
  if (!id) return { ok: false, error: NOT_FOUND };

  const current = await db.query.categories.findFirst({ where: eq(categories.id, id) });
  if (!current) return { ok: false, error: NOT_FOUND };

  const parsed = categorySchema.safeParse(readCategoryForm(formData));
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  const { name, emoji, color } = parsed.data;

  if (name !== current.name) {
    const clash = await db.query.categories.findFirst({
      where: eq(categories.name, name),
      columns: { id: true },
    });
    if (clash) return { ok: false, fieldErrors: { name: DUPLICATE_NAME } };
  }

  try {
    // O slug fica como está: renomear não quebra link nem filtro salvo.
    await db.update(categories).set({ name, emoji, color }).where(eq(categories.id, id));
  } catch {
    return { ok: false, fieldErrors: { name: DUPLICATE_NAME } };
  }

  revalidateCategories();
  return { ok: true };
}

/** Só apaga categoria vazia — lugar sem categoria não existe (FK é `restrict`). */
export async function deleteCategory(id: string): Promise<FormState> {
  await assertAdmin();

  const current = await db.query.categories.findFirst({
    where: eq(categories.id, id),
    columns: { id: true },
  });
  if (!current) return { ok: false, error: NOT_FOUND };

  const [{ value: vinculados }] = await db
    .select({ value: count() })
    .from(places)
    .where(eq(places.categoryId, id));

  if (vinculados > 0) {
    return { ok: false, error: `Tem ${vinculados} lugar(es) nessa categoria. Move eles antes.` };
  }

  await db.delete(categories).where(eq(categories.id, id));

  revalidateCategories();
  return { ok: true };
}

/** Sobe ou desce a categoria trocando o `sort_order` com a vizinha. */
export async function moveCategory(id: string, direction: "up" | "down"): Promise<FormState> {
  await assertAdmin();

  if (direction !== "up" && direction !== "down") {
    return { ok: false, error: "Direção inválida." };
  }

  const all = await db
    .select({ id: categories.id, sortOrder: categories.sortOrder, name: categories.name })
    .from(categories)
    .orderBy(asc(categories.sortOrder), asc(categories.name));

  const index = all.findIndex((c) => c.id === id);
  if (index === -1) return { ok: false, error: NOT_FOUND };

  const target = direction === "up" ? index - 1 : index + 1;
  if (target < 0 || target >= all.length) return { ok: true };

  const a = all[index];
  const b = all[target];

  if (a.sortOrder === b.sortOrder) {
    // Ordens empatadas (seed antigo, importação): renumera tudo e já aplica a troca.
    const reordered = [...all];
    reordered[index] = b;
    reordered[target] = a;
    for (const [i, c] of reordered.entries()) {
      await db.update(categories).set({ sortOrder: i }).where(eq(categories.id, c.id));
    }
  } else {
    await db.update(categories).set({ sortOrder: b.sortOrder }).where(eq(categories.id, a.id));
    await db.update(categories).set({ sortOrder: a.sortOrder }).where(eq(categories.id, b.id));
  }

  revalidateCategories();
  return { ok: true };
}
