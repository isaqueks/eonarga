"use client";

import { useActionState, useCallback, useState } from "react";

import { login } from "@/actions/auth";
import type { FormState } from "@/actions/form-state";
import { NargaCaptcha } from "@/components/captcha/narga-captcha";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const INITIAL: FormState = { ok: false };

// "off" em dev/testes; em produção o widget aparece sempre (docs/09).
const CAPTCHA_MODE = process.env.NEXT_PUBLIC_CAPTCHA_MODE === "off" ? "off" : "always";

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(login, INITIAL);
  // O reCAPTCHA falso libera o botão. Não valida nada; é só zoeira (docs/09).
  const [captchaOk, setCaptchaOk] = useState(CAPTCHA_MODE === "off");
  const onVerified = useCallback(() => setCaptchaOk(true), []);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          required
          className="h-11"
          aria-invalid={state.fieldErrors?.email ? true : undefined}
        />
        {state.fieldErrors?.email ? (
          <p className="text-destructive text-xs">{state.fieldErrors.email}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11"
          aria-invalid={state.fieldErrors?.password ? true : undefined}
        />
        {state.fieldErrors?.password ? (
          <p className="text-destructive text-xs">{state.fieldErrors.password}</p>
        ) : null}
      </div>

      {state.error ? (
        <p role="alert" className="text-destructive text-sm">
          {state.error}
        </p>
      ) : null}

      {CAPTCHA_MODE === "always" ? (
        <div className="flex justify-center">
          <NargaCaptcha onVerified={onVerified} />
        </div>
      ) : null}

      <Button type="submit" size="lg" className="h-11 w-full" disabled={pending || !captchaOk}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
