import type { ZodError } from "zod";

/** Retorno padrão das actions usadas com `useActionState`. */
export type FormState = {
  ok: boolean;
  /** Erro geral do formulário (aparece em cima do botão). */
  error?: string;
  /** Erro por campo, indexado pelo `name` do input. */
  fieldErrors?: Record<string, string>;
};

/** Estado das actions de admin que devolvem uma senha temporária pra mostrar uma vez. */
export type TempPasswordState = FormState & {
  tempPassword?: string;
  email?: string;
};

export const EMPTY_FORM_STATE: FormState = { ok: false };

/** Primeira mensagem de cada campo, no formato que os formulários esperam. */
export function fieldErrorsFrom(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path[0];
    if (typeof key !== "string" || out[key]) continue;
    out[key] = issue.message;
  }
  return out;
}

/** Lê um campo de texto do FormData sem explodir quando ele não veio. */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
