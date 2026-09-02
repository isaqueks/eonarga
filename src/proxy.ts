import { NextResponse, type NextRequest } from "next/server";

// Duplicado de src/lib/auth/session.ts de propósito: o proxy não deve importar módulos que puxam o banco.
const SESSION_COOKIE_NAME = "eonarga_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Rotas que funcionam sem cookie de sessão. */
const PUBLIC_PATHS = new Set([
  "/login",
  "/termos",
  "/manifest.webmanifest",
  "/logo.jpg",
  "/favicon.ico",
  "/icon.png",
  "/apple-icon.png",
  "/~offline",
  // O SW é buscado sem passar por página nenhuma; se caísse no redirect de login,
  // a atualização quebraria toda vez que a sessão vencesse.
  "/sw.js",
  "/api/health",
]);

// /api/ passa direto: cada route handler checa a sessão e responde 401 em JSON,
// que é o que um fetch do cliente espera (redirect pra HTML de login só confunde).
const PUBLIC_PREFIXES = ["/icons/", "/captcha/", "/_next/", "/api/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

/**
 * Só checa se o cookie existe (barato). Quem valida de verdade é o `getCurrentUser`,
 * que consulta o banco — o proxy não tem acesso ao SQLite nem deveria ter.
 * De quebra, injeta `x-pathname` pra o `requireUser()` montar o `?next=`.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);

  if (isPublic(pathname)) {
    return NextResponse.next({ request: { headers } });
  }

  const cookie = request.cookies.get(SESSION_COOKIE_NAME);
  if (cookie?.value) {
    const response = NextResponse.next({ request: { headers } });
    // A validade real é a do banco (renovada no getCurrentUser). Aqui só empurramos a validade
    // do cookie pra frente a cada navegação de página, senão ele morreria em 30 dias fixos.
    if (request.headers.get("accept")?.includes("text/html")) {
      response.cookies.set(SESSION_COOKIE_NAME, cookie.value, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
        expires: new Date(Date.now() + SESSION_TTL_MS),
      });
    }
    return response;
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Arquivos estáticos e o otimizador de imagem não passam por aqui.
  matcher: ["/((?!_next/static|_next/image).*)"],
};
