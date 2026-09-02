"use client";

import { useState } from "react";

import { NargaCaptcha } from "@/components/captcha/narga-captcha";

export function CaptchaDemo() {
  const [ok, setOk] = useState(false);

  return (
    <div className="flex flex-col items-start gap-4">
      <NargaCaptcha onVerified={() => setOk(true)} />
      <p className="text-narga text-sm" aria-live="polite">
        {ok ? "verificado ✅" : " "}
      </p>
      <button
        type="button"
        className="text-muted-foreground text-xs underline underline-offset-4"
        onClick={() => window.location.reload()}
      >
        recarregar a página pra testar de novo
      </button>
    </div>
  );
}
