/**
 * URL da foto de perfil, servida por `/api/uploads/[id]` (rota autenticada, docs/05).
 * O id troca a cada upload, então o conteúdo de uma URL nunca muda: pode ser cacheada
 * à vontade, tanto pelo navegador quanto pelo service worker.
 */
export function avatarUrl(avatarId: string, variant: "thumb" | "full" = "thumb"): string {
  return variant === "thumb" ? `/api/uploads/${avatarId}?v=thumb` : `/api/uploads/${avatarId}`;
}
