"use server";

import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { assertUser, getCurrentUser } from "@/lib/auth/guards";
import {
  DUMMY_HASH,
  hashPassword,
  isWeakPassword,
  MIN_PASSWORD_LENGTH,
  verifyPassword,
} from "@/lib/auth/password";
import {
  clearSessionCookie,
  createSession,
  invalidateSession,
  invalidateUserSessions,
  setSessionCookie,
} from "@/lib/auth/session";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";
import { profileSchemaFor } from "@/lib/profile";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import { field, fieldErrorsFrom, type FormState } from "@/actions/form-state";

/** A mesma resposta pra email inexistente, senha errada e conta desativada. */
const GENERIC_LOGIN_ERROR = "Email ou senha errados";

const LOGIN_RATE_LIMIT = { limit: 5, windowMs: 15 * 60_000 };

const emailField = z.string().trim().toLowerCase().pipe(z.email("Email inválido"));

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Bota a senha"),
  next: z.string().optional(),
});

/** Só aceita caminho relativo do próprio app; nada de `//evil.com` nem `/\evil.com`. */
function safeNext(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (!value.startsWith("/")) return undefined;
  if (value.startsWith("//") || value.startsWith("/\\")) return undefined;
  return value;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export async function login(_prevState: FormState, formData: FormData): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: field(formData, "email"),
    password: field(formData, "password"),
    next: field(formData, "next") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { email, password } = parsed.data;
  const next = safeNext(parsed.data.next);

  const rateKey = `login:${email}:${await clientIp()}`;
  if (!checkRateLimit(rateKey, LOGIN_RATE_LIMIT).ok) {
    return { ok: false, error: "Muitas tentativas. Espera 15 minutos." };
  }

  const user = await db.query.users.findFirst({ where: eq(users.email, email) });

  // Email que não existe: verifica um hash de mentira pra o tempo bater com o do caminho normal.
  if (!user) {
    await verifyPassword(DUMMY_HASH, password);
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);
  if (!passwordOk || !user.isActive) {
    return { ok: false, error: GENERIC_LOGIN_ERROR };
  }

  resetRateLimit(rateKey);

  const now = new Date().toISOString();
  await db
    .update(users)
    .set({ lastLoginAt: now, lastSeenAt: now, updatedAt: now })
    .where(eq(users.id, user.id));

  const userAgent = (await headers()).get("user-agent");
  const { token, expiresAt } = await createSession(user.id, userAgent);
  await setSessionCookie(token, expiresAt);

  redirect(user.mustChangePassword ? "/trocar-senha" : (next ?? "/feed"));
}

export async function logout(): Promise<void> {
  const current = await getCurrentUser();
  if (current) await invalidateSession(current.session.id);
  await clearSessionCookie();
  redirect("/login");
}

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Bota a senha atual"),
    newPassword: z
      .string()
      .min(
        MIN_PASSWORD_LENGTH,
        `A senha nova precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres`,
      ),
    confirmPassword: z.string().min(1, "Repete a senha nova"),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "As duas senhas não batem",
    path: ["confirmPassword"],
  });

export async function changePassword(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const { user, session } = await assertUser();

  const parsed = changePasswordSchema.safeParse({
    currentPassword: field(formData, "currentPassword"),
    newPassword: field(formData, "newPassword"),
    confirmPassword: field(formData, "confirmPassword"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  const { currentPassword, newPassword } = parsed.data;

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    return { ok: false, fieldErrors: { currentPassword: "Senha atual errada" } };
  }
  if (isWeakPassword(newPassword)) {
    return {
      ok: false,
      fieldErrors: { newPassword: "Essa senha é fácil demais. Pensa em outra." },
    };
  }
  if (newPassword === currentPassword) {
    return { ok: false, fieldErrors: { newPassword: "Essa já é a sua senha." } };
  }

  await db
    .update(users)
    .set({
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  // Trocou a senha: derruba os outros aparelhos, mantém este.
  await invalidateUserSessions(user.id, session.id);

  redirect("/feed");
}

export async function updateProfile(_prevState: FormState, formData: FormData): Promise<FormState> {
  const { user } = await assertUser();

  // As regras de gênero e testosterona dependem do papel (docs/08 #25).
  const parsed = profileSchemaFor(user.role).safeParse({
    name: field(formData, "name"),
    gender: field(formData, "gender"),
    testosterone: field(formData, "testosterone"),
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrorsFrom(parsed.error) };
  }

  await db
    .update(users)
    .set({
      name: parsed.data.name,
      gender: parsed.data.gender,
      testosterone: parsed.data.testosterone,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(users.id, user.id));

  revalidatePath("/perfil");
  return { ok: true };
}
