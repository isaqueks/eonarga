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

## Service worker (Serwist)

Estratégias por tipo de request:

| Request                                   | Estratégia                                | Motivo                                                                                                              |
| ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| App shell (JS/CSS com hash)               | Precache                                  | Gerado no build                                                                                                     |
| Páginas HTML (`/`, `/mapa`, `/lugares/*`) | NetworkFirst, timeout 3 s, fallback cache | Dados frescos quando dá; último ranking quando não dá                                                               |
| `/api/uploads/*` (fotos, v2)              | CacheFirst, 200 entradas, 30 dias         | Imutáveis                                                                                                           |
| Tiles do mapa                             | CacheFirst, **300 entradas, 14 dias**     | O Centro cabe em poucas centenas de tiles nos zooms 15–17. Respeitar os termos do provedor: nada de pré-baixar tudo |
| Geocoding / maps-link                     | NetworkOnly                               | Não faz sentido cachear                                                                                             |
| Mutações (POST)                           | NetworkOnly                               | Sem fila offline no MVP                                                                                             |
| Navegação offline sem cache               | `/~offline`                               | "Sem internet. E o narga? Fica pra depois."                                                                         |

Atualização: SW novo instala em background; um toast "Tem versão nova. Atualizar?" chama `skipWaiting` e recarrega. Nunca atualiza sozinho no meio de uma avaliação sendo escrita.

## Instalação

- **Android/Chrome**: captura `beforeinstallprompt` e mostra um banner discreto no Ranking a partir da 2ª visita ("Bota na tela inicial?"). Dispensar guarda em `localStorage` por 30 dias.
- **iOS/Safari**: não tem prompt. Detecta iOS + não-standalone e mostra a instrução com o ícone de compartilhar: "Compartilhar → Adicionar à Tela de Início".
- Depois de instalado (`display-mode: standalone`), esconde os dois.

## Checklist de PWA (Lighthouse)

- [ ] HTTPS (Caddy em prod; `localhost` é exceção válida em dev)
- [ ] Manifest válido com ícones 192 e 512 + maskable
- [ ] Service worker registrado com fallback offline
- [ ] Meta `theme-color`
- [ ] Viewport meta, zoom não bloqueado
- [ ] Apple touch icon
- [ ] Lighthouse PWA sem falhas; performance mobile ≥ 80 (mapa e editor são pesados: carregar com `dynamic()` só na rota que usa)
