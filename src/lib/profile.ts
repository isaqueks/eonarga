import { z } from "zod";

import type { User } from "@/lib/db/schema";

/** Opções de gênero pra quem não é admin. Piada interna do grupo (docs/08 #25). */
export const MEMBER_GENDERS = ["homossexual", "transsexual"] as const;
export const GENDER_MAX_LENGTH = 40;
/** ng/dL. Só vale pra membro; admin não tem teto. */
export const TESTOSTERONE_MEMBER_MAX = 1200;

const emptyToNull = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? null : value;

/**
 * Regras do perfil por papel: admin tem gênero em texto livre e testosterona sem limite;
 * membro escolhe o gênero da lista e a testosterona vai de 0 a 1200.
 */
export function profileSchemaFor(role: User["role"]) {
  const gender: z.ZodType<string> =
    role === "admin"
      ? z
          .string()
          .trim()
          .max(GENDER_MAX_LENGTH, `Gênero comprido demais (máximo ${GENDER_MAX_LENGTH})`)
      : z.enum(MEMBER_GENDERS, { error: "Escolhe uma das opções da lista." });

  const testosterone = z.coerce
    .number({ error: "Tem que ser um número." })
    .int("Sem vírgula. Testosterona é inteira.")
    .min(0, "Negativa não existe. Ainda.")
    .max(
      role === "admin" ? Number.MAX_SAFE_INTEGER : TESTOSTERONE_MEMBER_MAX,
      `Máximo ${TESTOSTERONE_MEMBER_MAX} ng/dL. Admin não tem limite; você tem.`,
    );

  return z.object({
    name: z.string().trim().min(2, "Nome curto demais").max(60, "Nome comprido demais (máximo 60)"),
    gender: z.preprocess(emptyToNull, gender.nullable()),
    testosterone: z.preprocess(emptyToNull, testosterone.nullable()),
  });
}

export type ProfileInput = z.infer<ReturnType<typeof profileSchemaFor>>;
