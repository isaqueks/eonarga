# 07 — Roadmap

Fases curtas, cada uma termina com algo usável. A ordem é a dependência real: contas antes de lugares, lugares antes de avaliações, PWA por último porque precisa de tudo pronto pra ter o que cachear.

## Fase 0 — Fundação

**Meta**: `npm run dev` sobe, Docker sobe, CI passa.

- [x] `create-next-app@latest` (Next 16.3, TS, App Router, Tailwind v4, ESLint) + Prettier
- [x] shadcn/ui init (preset `base-nova`), tema escuro padrão, paleta do [04](./04-ui-ux.md) em `globals.css`, fonte display
- [x] Drizzle + libsql, `schema.ts` completo (inclusive o que é v2), migration `0000_init`, seed de categorias e do primeiro admin
- [x] Migrations + seed rodam sozinhos no start do servidor (`src/instrumentation.ts`)
- [x] `Dockerfile` (multi-stage, `output: standalone`), `compose.yml` com Caddy e volume `app_data`, `Caddyfile` com o domínio
- [x] `.env.example`, `README.md` do repo com "como rodar"
- [x] GitHub Actions: lint + typecheck + vitest + build
- [x] `scripts/generate-icons.ts` + `public/icons` gerados do `eonarga.jpg`; `manifest.ts`
- [x] `src/lib/ranking.ts` com testes (adiantado da Fase 3)
- [x] Imagem Docker testada de ponta a ponta no VPS (Fase 5)

**Pronto quando**: abrir `http://localhost:3000` mostra o cachorro e "E o narga?". Feito em 02/09/2026.

## Fase 1 — Contas

**Meta**: só quem tem conta entra; admin cria contas.

- [x] `lib/auth`: hash argon2, criar/validar/renovar/destruir sessão, cookie
- [x] `/login`, logout, `proxy.ts` (Next 16), `requireUser` / `requireAdmin`
- [x] Seed do primeiro admin via env
- [x] `/admin/usuarios`: listar, criar (senha temporária exibida 1x), resetar, ativar/desativar, promover
- [x] `/trocar-senha` forçado quando `must_change_password`
- [x] `/perfil`: editar nome, trocar senha, sair
- [x] Rate limit no login
- [x] reCAPTCHA falso no login ([09](./09-captcha-de-zoeira.md)): widget, popup, 8 desafios com 44 ilustrações SVG, variações do cachorro geradas com sharp, `NEXT_PUBLIC_CAPTCHA_MODE`
- [x] Testes: hash/verify, sessão expira/renova, rate limit (guarda de admin fica pro e2e)

**Pronto quando**: você cria uma conta pra um amigo, ele loga no celular e troca a senha. Feito em 02/09/2026.

## Fase 2 — Lugares e mapa

**Meta**: cadastrar e encontrar lugares.

- [x] `lib/maps-link.ts`: parser de link do Google Maps (short link → redirect → `!3d…!4d…` ou `@lat,lng` + nome do path `/place/…`) com testes usando links reais como fixture
- [x] `/api/maps-link` (allowlist de hosts, timeout) e `/api/geocode` (proxy Photon + Nominatim, cache, User-Agent)
- [x] Componente de mapa (Leaflet, dynamic import), pino por categoria, cluster, "onde estou"; tiles OSM com filtro escuro
- [x] `/lugares/novo` em 2 passos por enquanto (colar link / buscar / marcar no mapa → dados); o passo "sua nota" entra na Fase 3
- [x] `/lugares/[slug]`: ficha completa, deep links do Maps, editar, arquivar
- [x] `/mapa` com bottom sheet
- [x] `/admin/categorias`
- [x] "Quero ir" / "Já fui" (`user_place_status`) e aba Rolê com as listas do grupo inteiro + chip "só eu"
- [x] E2E com Playwright (`npm run test:e2e`): login com captcha → cadastro marcando no mapa → ficha → quero ir → rolê → mapa → edição → admin
- [ ] Testar "colar link do Google Maps" com links reais do grupo (o parser tem testes, mas o fallback de HTML do link curto depende do Google)

**Pronto quando**: você cola um link do Maps mandado no WhatsApp e em 30 s o lugar está no mapa. Código pronto em 02/09/2026; falta o teste com links reais.

## Fase 3 — Avaliações e ranking

**Meta**: o app cumpre o nome.

- [x] Editor Tiptap v3 (StarterKit, Link, Placeholder, CharacterCount) com toolbar mobile
- [x] `lib/sanitize.ts` com allowlist + 15 testes (payloads clássicos de XSS)
- [x] Componente de nota em "nargas" (cachorro), meio ponto, acessível (`role="slider"`)
- [x] `/lugares/[slug]/avaliar`: criar/editar, veredito, data, rascunho em localStorage; é o passo 3 do wizard
- [x] `lib/ranking.ts` (média bayesiana) + testes; ordenações e filtros por query string
- [x] Home = ranking com chips, ordenação, busca, "ainda sem nota", "poucas notas", veredito mais recente
- [x] Reações com emoji (otimistas)
- [x] Selo "Aprovado pelo narga"

**Pronto quando**: 3 amigos avaliaram 5 lugares e o ranking faz sentido pra todo mundo. Código pronto em 02/09/2026; o critério de verdade depende da galera usar.

## Fase 3b — Galera e foto de perfil (pedido em 02/09/2026)

**Meta**: todo mundo vê todo mundo, com cara.

- [x] Infra de upload: `lib/storage.ts` (disco em `UPLOAD_DIR`, sharp → webp, sem EXIF, thumb), `GET /api/uploads/[id]` com cache imutável, validação por magic bytes e limite de 10 MB
- [x] `users.avatar_id` (migration 0002), action de trocar/remover foto no perfil, componente `UserAvatar` com fallback de iniciais
- [x] `/galera`: lista global de usuários (foto, nome, gênero, testosterona, nº de lugares, avaliações, quero ir / já fui), link no header e no perfil
- [x] Avatares nas listas de "já foram / querem ir" e nas avaliações

**Pronto quando**: você troca sua foto no celular e ela aparece na galera e nas suas avaliações.

## Fase 4 — PWA e polimento

**Meta**: instalado no celular de todo mundo.

- [x] Manifest, ícones, metas Apple, service worker **escrito à mão** (`public/sw.js`) com as estratégias do [06](./06-pwa-e-assets.md) — Serwist ficou de fora porque o plugin dele é webpack e o build aqui é Turbopack
- [x] Página offline (`/~offline`), toast "Tem versão nova. Atualizar?", banner de instalação (Android) e instrução (iOS)
- [x] Tema claro com `next-themes` e toggle no perfil ("Modo claro? E o narga?"), com os ajustes de contraste que ele exigiu
- [x] Estados vazios e erros com a copy do [04](./04-ui-ux.md): faltavam o 404 global (`src/app/not-found.tsx`) e o erro 500 (`src/app/error.tsx`); o resto já existia desde as fases 2 e 3
- [x] Lighthouse: `/login` mobile 91 / 100 / 100 e desktop 100 / 100 / 100 (performance / acessibilidade / boas práticas). A categoria `pwa` não existe mais no Lighthouse 12; manifest e SW conferidos na mão
- [x] Playwright: o smoke cobre login → criar lugar → avaliar → ranking, e ganhou o toggle de tema, o 404 e a página offline

**Pronto quando**: Lighthouse verde e o ícone do cachorro na tela inicial de um Android e de um iPhone. Código pronto em 02/09/2026; falta instalar de fato num Android e num iPhone de verdade.

## Fase 5 — Deploy

- [x] Domínio `eonarga.com.br` na Cloudflare apontando pro VPS (proxy ligado)
- [x] VPS compartilhado: imagem `eonarga:0.1.0` construída local e enviada, `compose.prod.yml` em `127.0.0.1:3010`, site no Caddy do sistema (ver [02](./02-stack-e-arquitetura.md#como-está-de-fato-no-ar)). No ar em 02/09/2026
- [ ] Backup diário (Litestream ou cron) + restore testado
- [ ] Criar contas da galera, mandar link no grupo

## Fase 6 — v2

Feita em 02/09/2026, na ordem de custo/benefício:

1. [x] Sortear rolê (roleta na aba "Quero ir", respeita categoria e "só eu")
2. [x] Fotos de lugar (upload com câmera, galeria com lightbox, apagar dono/admin, 30 por lugar)
3. [x] Feed (`/feed`: notas, lugares, status e reações) + placar na galera (mais avaliou, mais cadastrou, mais rodado, crítico mais chato)
4. [x] Respostas em avaliações (thread curta, apaga autor/autor da nota/admin)
5. [x] Tags livres (até 8 por lugar, qualquer membro edita, filtro `?tag=` no ranking, mapa e rolê)
6. [x] Exportar JSON (`/api/admin/export`) / importar links do Maps ou CSV do Takeout (`/admin/importar`)
7. [x] Link público somente leitura (`/p/<slug>?t=<token>`, HMAC com `APP_SECRET`; sem a variável o recurso some)

## Fase 7 — Push e várias avaliações (pedido em 02/09/2026)

- [x] Web Push: `lib/push.ts` (VAPID, `web-push`, limpeza de assinaturas mortas), `push_subscriptions` e `notifications` (migration 0004), `push` e `notificationclick` no `sw.js`
- [x] Toggle "Ativar notificações" no perfil e lembrete no ranking; `GET /api/push/public-key` lê a chave em runtime
- [x] "Chamar galera pra cá" na ficha, com confirmação, rate limit e evento no feed
- [x] `/admin/notificar`: aviso arbitrário pra uma pessoa ou pra todos, com histórico
- [x] Uma avaliação por visita: unique de `reviews` removido, `avaliar?review=<id>` edita, "Fui de novo? Dá outra nota", todas contam na média
- [ ] Testar o push num Android e num iPhone de verdade (prompt, entrega, toque na notificação)

## Fase 8 — Posts no feed (pedido em 02/09/2026)

- [x] Tabela `posts` (migration 0005): `body` e/ou `photo_id`, `place_id` opcional, `lat/lng` sempre, `address`, índices em `created_at` e `user_id`
- [x] `lib/posts.ts` puro (limite de 1000, `haversineMeters`, `nearestPlace` a 150 m, `postInputSchema`, prévia do texto) com teste
- [x] `createPost` / `deletePost` (`actions/posts.ts`): foto reprocessada pelo sharp, lugar ativo manda na coordenada, 20 posts/hora, apaga a imagem junto
- [x] `queries/posts.ts` (uma query com join em users e left join em places/categories) entrando no merge do `listFeed`
- [x] Feed com botão "📸 Postar", card de post (foto em tela cheia, menu "⋯" com Apagar) e **avaliação também como card** (nargas, veredito e prévia com "ver avaliação")
- [x] `/feed/novo`: foto com câmera, texto com contador e os três jeitos de dizer onde ("onde estou" com "Você tá no X?", lista de lugares por distância, pino no mapa)
- [x] E2E: postar com lugar, postar só foto pelo mapa, apagar pelo menu e conferir a avaliação como card

- [x] Correção: "visto por último" na galera passa a refletir o último uso (`last_seen_at`, folga de 5 min), não o último login

- [x] Botão fixo "Instalar aplicativo" na home e no feed pra celular sem o PWA (substitui o banner da 2ª visita)

- [x] Reações e comentários em posts (migration 0007): `post_reactions` / `post_comments`, `togglePostReaction` / `addPostComment` / `deletePostComment` em `actions/posts.ts`, `ReactionBar` e `CommentThread` genéricos (avaliação ou post), reação em post como linha do feed, testes do `listFeed` e e2e

## Definição de pronto (qualquer tarefa)

- Funciona no celular (Chrome Android e Safari iOS) e no desktop
- Sem erro no console, sem warning de hidratação
- Server action valida com Zod e checa permissão
- Se tem lógica pura (ranking, parser, sanitize), tem teste
- Copy em pt-BR, revisada
