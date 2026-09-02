/*
 * Service worker do "E o narga?" — escrito à mão, sem bundler.
 *
 * Por que não Serwist/Workbox: o build é Turbopack e o plugin do Serwist é webpack.
 * Este arquivo é servido como está de `public/sw.js`, então não pode usar import/export
 * nem sintaxe que dependa de transpilação. Estratégias: docs/06-pwa-e-assets.md.
 *
 * A versão vem da query do registro (`/sw.js?v=0.3.0`), que é o que faz o navegador
 * baixar um SW novo a cada release e o que dá nome aos caches efêmeros.
 */

const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";

// Caches que morrem a cada release (conteúdo é do build).
const SHELL_CACHE = `eonarga-${VERSION}-shell`;
const PAGES_CACHE = `eonarga-${VERSION}-pages`;
// Caches que sobrevivem entre releases: o conteúdo não vem do nosso build e é caro
// de rebaixar (tiles do OSM, fotos). Limpar isso a cada deploy seria hostil com o
// provedor de tiles e com o 4G de quem usa.
const TILE_CACHE = "eonarga-tiles";
const UPLOAD_CACHE = "eonarga-uploads";
const KEEP = [SHELL_CACHE, PAGES_CACHE, TILE_CACHE, UPLOAD_CACHE];

const OFFLINE_URL = "/~offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/logo.jpg", "/manifest.webmanifest"];

const NAV_TIMEOUT_MS = 3000;
const TILE_HOST = "tile.openstreetmap.org";
const TILE_MAX_ENTRIES = 300;
const TILE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
const UPLOAD_MAX_ENTRIES = 200;

/** Cache-first pra coisa hasheada ou imutável (ver `handleFetch`). */
const CACHE_FIRST_PREFIXES = ["/_next/static/", "/_next/image", "/icons/", "/captcha/"];
const CACHE_FIRST_PATHS = ["/logo.jpg", "/manifest.webmanifest", "/favicon.ico"];

// -------------------------------------------------------------------- ciclo de vida

self.addEventListener("install", (event) => {
  event.waitUntil(precache());
  // Sem skipWaiting(): quem decide atualizar é a pessoa, pelo toast (docs/06).
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith("eonarga-") && !KEEP.includes(name))
          .map((name) => caches.delete(name)),
      );
      await sweepExpiredTiles();
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

/** Um `addAll` falho derrubaria o install inteiro; aqui cada arquivo se vira sozinho. */
async function precache() {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    PRECACHE.map(async (url) => {
      try {
        const response = await fetch(url, { cache: "reload" });
        if (response.ok) await cache.put(url, response);
      } catch {
        // sem rede na hora do install: o resto do SW continua valendo
      }
    }),
  );
}

// -------------------------------------------------------------------- notificações

/**
 * Push do servidor (src/lib/push.ts). O payload é o JSON de `PushPayload`, mas
 * um push sem corpo (teste do DevTools, ping do próprio serviço) é permitido pela
 * spec e não pode ficar sem notificação: `userVisibleOnly` exige mostrar alguma coisa.
 */
self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json() || {};
    } catch {
      data = { body: event.data.text() };
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || "E o narga?", {
      body: data.body || "Tem novidade no app.",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      // Mesma tag = um balão só por assunto; renotify faz o celular apitar mesmo assim.
      tag: data.tag || "eonarga",
      renotify: true,
      data: { url: data.url || "/" },
    }),
  );
});

/** Tocar na notificação leva pro lugar certo, reaproveitando a janela já aberta. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const raw = (event.notification.data && event.notification.data.url) || "/";
  const target = new URL(raw, self.location.origin);

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

      for (const client of windows) {
        if (new URL(client.url).origin !== target.origin) continue;
        // `navigate` não existe em todo navegador; sem ele, só foca onde estiver.
        if (typeof client.navigate === "function") {
          const navigated = await client.navigate(target.href).catch(() => null);
          await (navigated || client).focus();
        } else {
          await client.focus();
        }
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});

// ------------------------------------------------------------------------- roteador

self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Mutação (POST de server action, upload) nunca passa por aqui.
  if (request.method !== "GET") return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // Tiles do mapa são de terceiro e têm regra própria.
  if (url.hostname === TILE_HOST || url.hostname.endsWith(`.${TILE_HOST}`)) {
    event.respondWith(tileFirst(request));
    return;
  }

  // Fora isso, só mexemos no que é nosso (Photon, Nominatim e Google ficam de fora).
  if (url.origin !== self.location.origin) return;

  // O próprio SW e o registro dele: sempre da rede.
  if (url.pathname === "/sw.js") return;

  if (request.mode === "navigate") {
    event.respondWith(navigateFirst(request));
    return;
  }

  if (url.pathname.startsWith("/api/uploads/")) {
    event.respondWith(cacheFirst(request, UPLOAD_CACHE, UPLOAD_MAX_ENTRIES));
    return;
  }

  // Resto da API (geocode, maps-link, health) e os payloads RSC: sempre rede.
  if (url.pathname.startsWith("/api/")) return;

  const cacheFirstable =
    CACHE_FIRST_PATHS.includes(url.pathname) ||
    CACHE_FIRST_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

  if (cacheFirstable) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
  }
});

// --------------------------------------------------------------------- estratégias

/**
 * Navegação: rede primeiro com 3 s de paciência, senão a última versão da mesma URL,
 * senão a página offline. Redirect do proxy (`opaqueredirect`, status 0) passa direto.
 */
async function navigateFirst(request) {
  const cache = await caches.open(PAGES_CACHE);

  try {
    const response = await withTimeout(fetch(request), NAV_TIMEOUT_MS);
    if (response && response.ok && response.type === "basic") {
      cache.put(request, response.clone()).catch(() => {});
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;

    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;

    return new Response("Sem internet. E o narga? Fica pra depois.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
}

/** Cache-first simples, com poda opcional por número de entradas. */
async function cacheFirst(request, cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request, { ignoreVary: true });
  if (cached) return cached;

  const response = await fetch(request);
  if (response && response.ok && response.type === "basic") {
    await cache.put(request, response.clone()).catch(() => {});
    if (maxEntries) await trim(cache, maxEntries);
  }
  return response;
}

/**
 * Tiles do OSM: cache-first com validade de 14 dias e teto de ~300 entradas
 * (o Centro inteiro cabe nisso nos zooms 15–17). A resposta é regravada como
 * `Response` nossa só pra carimbar `x-sw-cached-at`: `Date` não é um header
 * liberado pelo CORS, então não dá pra confiar nele pra saber a idade.
 */
async function tileFirst(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached && !isExpired(cached)) return cached;

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      const stamped = await stamp(response);
      if (stamped) {
        await cache.put(request, stamped).catch(() => {});
        await trim(cache, TILE_MAX_ENTRIES);
      }
    }
    return response;
  } catch (error) {
    // Vencido ainda é melhor que quadrado cinza.
    if (cached) return cached;
    throw error;
  }
}

/** Copia a resposta pra uma `Response` própria com a hora da gravação. */
async function stamp(response) {
  try {
    const body = await response.clone().arrayBuffer();
    const headers = new Headers();
    const type = response.headers.get("content-type");
    if (type) headers.set("content-type", type);
    headers.set("x-sw-cached-at", String(Date.now()));
    return new Response(body, { status: 200, statusText: "OK", headers });
  } catch {
    return null;
  }
}

function isExpired(response) {
  const at = Number(response.headers.get("x-sw-cached-at"));
  if (!at) return false;
  return Date.now() - at > TILE_MAX_AGE_MS;
}

/** `cache.keys()` devolve na ordem de inserção, então os primeiros são os mais velhos. */
async function trim(cache, maxEntries) {
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;
  await Promise.all(keys.slice(0, keys.length - maxEntries).map((key) => cache.delete(key)));
}

/** Faxina dos tiles vencidos, uma vez por ativação (é barato e ninguém está olhando). */
async function sweepExpiredTiles() {
  try {
    const cache = await caches.open(TILE_CACHE);
    const keys = await cache.keys();
    await Promise.all(
      keys.map(async (key) => {
        const response = await cache.match(key);
        if (response && isExpired(response)) await cache.delete(key);
      }),
    );
  } catch {
    // faxina é best-effort
  }
}

function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);
}
