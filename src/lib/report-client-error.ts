/**
 * Manda o erro que a pessoa viu na tela ("Deu ruim do nosso lado") pro log do servidor
 * (docs/08 #54), via `POST /api/client-error`. Sem isso, um erro no celular de alguém
 * não deixa rastro nenhum: o servidor só vê o que acontece nele.
 *
 * Só em produção, nunca lança e não espera resposta (`keepalive` pra sobreviver a um
 * recarregamento logo em seguida).
 */
export function reportClientError(info: {
  message: string;
  digest?: string;
  stack?: string;
}): void {
  if (process.env.NODE_ENV !== "production") return;
  try {
    const body = JSON.stringify({
      message: info.message.slice(0, 500),
      digest: info.digest?.slice(0, 64),
      stack: info.stack?.slice(0, 1500),
      path: `${window.location.pathname}${window.location.search}`.slice(0, 300),
      version: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    });
    void fetch("/api/client-error", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body,
    }).catch(() => {});
  } catch {
    // Relatar o erro não pode virar outro erro.
  }
}
