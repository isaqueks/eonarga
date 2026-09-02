import type { Metadata } from "next";

import { CaptchaDemo } from "./captcha-demo";

export const metadata: Metadata = {
  title: "reNARGA (demo)",
};

/** Página só pra olhar o captcha isolado. Não faz parte do app. */
export default function CaptchaDevPage() {
  return (
    <main className="bg-background flex min-h-dvh flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl">reNARGA</h1>
        <p className="text-muted-foreground text-sm">
          Demo do captcha de zoeira. Clique em &ldquo;Não sou um robô&rdquo;.
        </p>
      </header>
      <CaptchaDemo />
    </main>
  );
}
