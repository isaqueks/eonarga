"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertAdmin } from "@/lib/auth/guards";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { invalidateUserSessions } from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { ROLES, users } from "@/lib/db/schema";
import {
  field,
  fieldErrorsFrom,
  type FormState,
  type TempPasswordState,
} from "@/actions/form-state";

const ADMIN_PATH = "/admin/usuarios";

const createUserSchema = z.object({
  name: z.string().trim().min(2, "Nome curto demais").max(60, "Nome comprido demais (máximo 60)"),
  email: z.string().trim().toLowerCase().pipe(z.email("Email inválido")),
});

/** Cria o usuário com senha temporária. A senha volta uma vez só; depois some. */
export async function createUser(
  _prevState: TempPasswordState,
  formData: FormData,
): Promise<TempPasswordState> {
  await assertAdmin();

  const parsed = createUserSchema.safeParse({
    name: field(formData, "name"),
    email: field(formData, "email"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { name, email } = parsed.data;

  const existing = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (existing) {
    return { ok: false, fieldErrors: { email: "Já tem alguém com esse email." } };
  }

  const tempPassword = generateTempPassword();
  try {
    await db.insert(users).values({
      id: nanoid(12),
      name,
      email,
      passwordHash: await hashPassword(tempPassword),
      role: "member",
      isActive: true,
      mustChangePassword: true,
    });
  } catch {
    // Corrida no índice único de email, ou qualquer outro tropeço do banco.
    return { ok: false, fieldErrors: { email: "Já tem alguém com esse email." } };
  }

  revalidatePath(ADMIN_PATH);
  return { ok: true, tempPassword, email };
}

/** Gera uma senha temporária nova, força a troca e derruba as sessões do usuário. */
export async function resetUserPassword(userId: string): Promise<TempPasswordState> {
  await assertAdmin();

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return { ok: false, error: "Usuário não encontrado." };

  const tempPassword = generateTempPassword();
  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(tempPassword),
      mustChangePassword: true,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, userId));

  await invalidateUserSessions(userId);

  revalidatePath(ADMIN_PATH);
  return { ok: true, tempPassword, email: target.email };
}

export async function setUserActive(userId: string, active: boolean): Promise<FormState> {
  const { user: me } = await assertAdmin();

  if (userId === me.id) {
    return { ok: false, error: "Você não pode desativar a si mesmo." };
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return { ok: false, error: "Usuário não encontrado." };

  await db
    .update(users)
    .set({ isActive: active, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId));

  // Desativou: derruba na hora, sem esperar a sessão vencer.
  if (!active) await invalidateUserSessions(userId);

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}

const roleSchema = z.enum(ROLES);

export async function setUserRole(userId: string, role: string): Promise<FormState> {
  const { user: me } = await assertAdmin();

  const parsedRole = roleSchema.safeParse(role);
  if (!parsedRole.success) return { ok: false, error: "Papel inválido." };

  if (userId === me.id) {
    return { ok: false, error: "Você não pode mudar o próprio papel. Pede pra outro admin." };
  }

  const target = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!target) return { ok: false, error: "Usuário não encontrado." };
  if (target.role === parsedRole.data) return { ok: true };

  if (parsedRole.data === "member") {
    const [{ value: outrosAdmins }] = await db
      .select({ value: count() })
      .from(users)
      .where(and(eq(users.role, "admin"), eq(users.isActive, true), ne(users.id, userId)));
    if (outrosAdmins === 0) {
      return { ok: false, error: "Não dá pra tirar o último admin." };
    }
  }

  await db
    .update(users)
    .set({ role: parsedRole.data, updatedAt: new Date().toISOString() })
    .where(eq(users.id, userId));

  revalidatePath(ADMIN_PATH);
  return { ok: true };
}
