# 06 — PWA e assets

## Objetivo

Abrir do ícone na tela inicial, em tela cheia, com splash do cachorro, e não quebrar quando o 4G engasgar.

## Manifest (`src/app/manifest.ts`)

```json
{
  "name": "E o narga?",
  "short_name": "E o narga?",
  "description": "Ranking de rolês do Centro. Interno. Zoeira.",
  "lang": "pt-BR",
  "start_url": "/?source=pwa",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0e1110",
  "theme_color": "#0e1110",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ],
  "shortcuts": [
    {
      "name": "Adicionar lugar",
      "url": "/lugares/novo",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    },
    { "name": "Mapa", "url": "/mapa" }
  ]
}
```

iOS ignora parte disso; precisa de `<link rel="apple-touch-icon">` (180×180) e das metas `apple-mobile-web-app-*` no `layout.tsx`. O Next cuida via `metadata`.

## Ícones a partir de `eonarga.jpg`

O arquivo é 554×554, JPEG, sem transparência, com o texto "e o narga?" na faixa inferior. Isso define o que gerar:

| Arquivo                                     | Tamanho        | Recorte                                                                                                                                                                                                                |
| ------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `favicon.ico` (16/32/48) + `favicon-32.png` | pequeno        | **Recorte no rosto** (olhos + focinho, aprox. y 40–460 do original). Em 16 px o texto vira ruído; o rosto ainda lê                                                                                                     |
| `apple-touch-icon.png`                      | 180            | Imagem inteira (iOS arredonda os cantos). Fundo é opaco, ok                                                                                                                                                            |
| `icon-192.png`, `icon-512.png`              | 192 / 512      | Imagem inteira                                                                                                                                                                                                         |
| `icon-maskable-512.png`                     | 512            | Imagem inteira reduzida a **80%** sobre fundo `#0e1110`, centralizada. A zona segura do maskable é o círculo central de 80%; assim o rosto não é cortado. O texto pode sumir na borda em launchers redondos: aceitável |
| `logo-face.png`                             | 256            | Mesmo recorte do favicon, pro header                                                                                                                                                                                   |
| `logo.jpg`                                  | 554 (original) | Cópia do original pra login e estados vazios                                                                                                                                                                           |
| `og.png`                                    | 1200×630       | Só se rolar link público (v2)                                                                                                                                                                                          |

Script `scripts/generate-icons.ts` com `sharp`, rodado por `npm run icons`. Saída versionada em `public/icons/` (é rápido de regerar, mas commitar evita dependência de build).

O JPEG é bem comprimido (meme de WhatsApp). Em 512 px vai ficar levemente borrado, e isso é parte da graça. Se quiser nitidez, só com outra fonte da imagem. Os recortes exatos a gente acerta olhando o resultado.

## Service worker (à mão, `public/sw.js`)

**Não usamos Serwist nem Workbox.** O build é Turbopack e o plugin do Serwist é webpack;
o `@serwist/next` roda o `injectManifest` no build do webpack, que não existe aqui. Como o
que a gente precisa cabe em ~200 linhas, o worker é um arquivo JS puro em `public/sw.js`,
servido como está, sem build step, sem dependência nova.

Consequências de não ter bundler:

- **Sem precache do build**: não existe manifesto de assets gerado, então o app shell não é
  pré-baixado. `/_next/static/*` é hasheado e entra no cache na primeira visita (cache-first),
  o que na prática dá o mesmo resultado depois do primeiro acesso.
- **Versão pela query**: o cliente registra `/sw.js?v=<version do package.json>`
  (`NEXT_PUBLIC_APP_VERSION`, injetado no `next.config.ts`). Mudar a versão muda os bytes da URL,
  que é o que faz o navegador buscar um worker novo, e é o que nomeia os caches do release.
- **Bump manual**: subir uma versão sem bumpar o `package.json` não troca a URL do SW. O
  navegador ainda revalida o `/sw.js` (servido com `Cache-Control: no-cache`) e percebe a
  diferença de bytes, mas os caches continuam com o nome antigo. Bumpe a versão a cada deploy.

### Estratégias por request

| Request                                   | Estratégia                                             | Cache               |
| ----------------------------------------- | ------------------------------------------------------ | ------------------- |
| Navegação (`request.mode === "navigate"`) | NetworkFirst, timeout 3 s → cache da URL → `/~offline` | `eonarga-<v>-pages` |
| `/_next/static/*`, `/_next/image`         | CacheFirst (é hasheado)                                | `eonarga-<v>-shell` |
| `/icons/*`, `/captcha/*`, `/logo.jpg`     | CacheFirst                                             | `eonarga-<v>-shell` |
| Tiles do `tile.openstreetmap.org`         | CacheFirst, **300 entradas, 14 dias**                  | `eonarga-tiles`     |
| `/api/uploads/*` (fotos)                  | CacheFirst, 200 entradas                               | `eonarga-uploads`   |
| Resto de `/api/*`, payloads RSC, `/sw.js` | NetworkOnly (nem intercepta)                           | —                   |
| Qualquer método diferente de GET          | NetworkOnly                                            | —                   |

- Pré-cache no `install`: `/~offline`, `/icons/icon-192.png`, `/logo.jpg`, `/manifest.webmanifest`.
  Cada um por conta própria: um 404 não derruba a instalação inteira.
- Só entra no cache resposta `ok` e de mesma origem (`type === "basic"`); os tiles são a única
  exceção de terceiro, e mesmo eles só quando vêm `ok` (o Leaflet pede com `crossOrigin`).
- O redirect do proxy pro login chega como `opaqueredirect` (status 0) e passa direto, sem cachear.
- Validade dos tiles: a resposta é regravada como `Response` nossa com o header `x-sw-cached-at`.
  `Date` não é um header liberado pelo CORS, então não dá pra ler a idade da original.
- No `activate`, apaga todo cache `eonarga-*` que não seja de agora. Os caches de tiles e de
  fotos **não** têm versão no nome de propósito: rebaixar 300 tiles a cada deploy seria falta de
  educação com o OSM e com o 4G da galera.

### Atualização

`install` **não** chama `skipWaiting()`. Quando um worker novo fica `installed` e já existe
`controller`, o cliente (`src/components/pwa/service-worker.tsx`) mostra um toast fixo acima da
bottom nav: "Tem versão nova. Atualizar?". O botão manda `postMessage({ type: "SKIP_WAITING" })`,
o SW chama `skipWaiting()` e só então, no `controllerchange`, o cliente dá `location.reload()`.
Nunca recarrega sozinho: ninguém perde uma avaliação pela metade.

### Registro

`src/components/pwa/service-worker.tsx`, montado no `src/app/layout.tsx`. Registra só quando
`NODE_ENV === "production"` (em dev o SW atrapalha o HMR) e quando existe `navigator.serviceWorker`.
`/sw.js` está nas rotas públicas do `proxy.ts` — se caísse no redirect de login, a atualização
quebraria toda vez que a sessão vencesse — e o `next.config.ts` manda
`Cache-Control: no-cache, no-store, must-revalidate` pra ele.

### Página offline

`src/app/~offline/page.tsx`: rota estática, pública, fora dos grupos `(app)` e `(auth)`, então usa
só o root layout. Cachorro + "Sem internet. E o narga? Fica pra depois." + "Tentar de novo"
(`location.reload()`). Usa `<img>` cru em vez de `next/image` porque o `next/image` viraria
`/_next/image?url=…`, que pode não estar no cache na hora que faltar internet.

### O que fica de fora

- Sem fila offline: mutação sem rede falha e pronto (nada de background sync no MVP).
- O cache de páginas guarda HTML de quem estava logado. É o navegador da pessoa, num app onde
  nada é privado dentro do grupo (docs/01), mas quem sair do app num celular emprestado pode ver
  a última tela em cache offline. Se incomodar, dá pra limpar os caches no logout.

## Instalação

`src/components/pwa/install-banner.tsx`, renderizado no topo do Ranking.

- **Android/Chrome**: captura `beforeinstallprompt` (com `preventDefault()`, senão o Chrome mostra a barrinha dele) e oferece "Bota na tela inicial?" com os botões "Instalar" e "Agora não".
- **iOS/Safari**: não tem prompt. Detecta iOS (inclusive iPad, que se apresenta como Macintosh — o `maxTouchPoints` entrega) e mostra "Compartilhar → Adicionar à Tela de Início".
- **Só a partir da 2ª visita**: contador em `localStorage` `eonarga:visits`, incrementado uma vez por sessão (`sessionStorage` `eonarga:visit-counted`).
- **Dispensar**: `eonarga:install-dismissed` guarda a data; some por 30 dias. Recusar o prompt nativo conta como dispensar.
- Depois de instalado (`display-mode: standalone`, ou `navigator.standalone` no iOS), não aparece nada.
- A elegibilidade sai de `useSyncExternalStore` (localStorage + userAgent + display-mode são estado de fora do React e não existem no servidor), então a hidratação começa escondida e não tem divergência.
- **Limitação conhecida**: o listener do `beforeinstallprompt` só entra no ar depois da hidratação. Se o Chrome disparar antes, o banner do Android não aparece nessa carga — na próxima aparece.

## Tema claro

`next-themes` (`attribute="class"`, `defaultTheme="dark"`, `enableSystem={false}`) no
`src/app/layout.tsx`, com `suppressHydrationWarning` no `<html>` — a classe do tema é escrita
pelo script do next-themes antes da hidratação, então servidor e cliente divergem de propósito.

- Toggle no perfil (`src/app/(app)/perfil/theme-toggle.tsx`): "Modo claro? E o narga?" no escuro,
  "Voltar pro escuro" no claro. O rótulo troca por CSS (`dark:`), não por estado, pra não ter
  flash nem `mounted` de mentira.
- `theme-color`: `#0e1110` no escuro, `#f4f6f5` no claro. Como o tema é classe (e não
  `prefers-color-scheme`), o `viewport.themeColor` do Next só dá o valor inicial; o
  `ThemeColorMeta` sincroniza a meta no cliente.
- Ajustes de contraste que o tema claro exigiu (`src/app/globals.css`): `--primary` passou de
  `#d99a1a` pra `#96650a` com `--primary-foreground` branco (o âmbar do escuro dava 2,4:1 em
  `text-primary` sobre fundo claro) e `--destructive` de `#d64545` pra `#c62828`.
- O mapa (`map.css`) só ganha o filtro escuro nos tiles dentro de `.dark`; os pinos e clusters
  agora misturam com `var(--background)` em vez do `#0e1110` fixo, senão o número do cluster
  ficava preto no preto.

## Checklist de PWA (Lighthouse)

Rodado em produção local (`npm run build && npm start -- -p 3002`) com Lighthouse 12.8, que já
não tem categoria `pwa` — manifest e SW foram conferidos na mão.

- [x] HTTPS (Caddy em prod; `localhost` é exceção válida em dev)
- [x] Manifest válido com ícones 192 e 512 + maskable
- [x] Service worker registrado com fallback offline (`navigator.serviceWorker.ready` resolve; com a rede cortada, `/mapa` cai na `/~offline` e `/` volta do cache de páginas)
- [x] Meta `theme-color` (e ela acompanha o tema)
- [x] Viewport meta, zoom não bloqueado
- [x] Apple touch icon (180, via `src/app/apple-icon.png`)
- [x] Lighthouse: `/login` desktop 100/100/100, `/login` mobile 91/100/100, `/termos` desktop 100/100/100, `/~offline` mobile 94/100/100 (performance / acessibilidade / boas práticas). As rotas com sessão não dá pra medir sem cookie; a estrutura é a mesma do `/login`.
