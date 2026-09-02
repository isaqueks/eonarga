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
- [ ] `docker compose up` testado de ponta a ponta (fica pra Fase 5, no VPS)

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

- [ ] Editor Tiptap (StarterKit, Link, Placeholder, CharacterCount) com toolbar mobile
- [ ] `lib/sanitize.ts` com allowlist + testes (payloads clássicos de XSS)
- [ ] Componente de nota em "nargas" (cachorro), meio ponto, acessível
- [ ] `/lugares/[slug]/avaliar`: criar/editar, veredito, data, rascunho em localStorage
- [ ] `lib/ranking.ts` (média bayesiana) + testes
- [ ] Home = ranking com chips, ordenação, busca, "ainda sem nota", "poucas notas"
- [ ] Reações com emoji
- [ ] Selo "Aprovado pelo narga"

**Pronto quando**: 3 amigos avaliaram 5 lugares e o ranking faz sentido pra todo mundo.

## Fase 4 — PWA e polimento

**Meta**: instalado no celular de todo mundo.

- [ ] Manifest, ícones, metas Apple, Serwist com as estratégias do [06](./06-pwa-e-assets.md)
- [ ] Página offline, toast de atualização, banner de instalação (Android) e instrução (iOS)
- [ ] Estados vazios e erros com a copy do [04](./04-ui-ux.md)
- [ ] Lighthouse mobile: PWA ok, performance ≥ 80, acessibilidade ≥ 90
- [ ] Playwright: login → criar lugar → avaliar → ver no ranking

**Pronto quando**: Lighthouse verde e o ícone do cachorro na tela inicial de um Android e de um iPhone.

## Fase 5 — Deploy

- [ ] Domínio `eonarga.com.br` na Cloudflare apontando pro VPS (proxy ligado, SSL "Full")
- [ ] VPS compartilhado: imagem construída local e enviada, `compose.prod.yml` em `127.0.0.1:3010`, site no Caddy do sistema (ver [02](./02-stack-e-arquitetura.md#como-está-de-fato-no-ar))
- [ ] Backup diário (Litestream ou cron) + restore testado
- [ ] Criar contas da galera, mandar link no grupo

## Fase 6 — v2 (por demanda)

Ordem sugerida por custo/benefício:

1. Sortear rolê
2. Fotos
3. Feed + placar
4. Respostas em avaliações
5. Tags livres
6. Exportar JSON / importar Takeout
7. Link público somente leitura

## Definição de pronto (qualquer tarefa)

- Funciona no celular (Chrome Android e Safari iOS) e no desktop
- Sem erro no console, sem warning de hidratação
- Server action valida com Zod e checa permissão
- Se tem lógica pura (ranking, parser, sanitize), tem teste
- Copy em pt-BR, revisada
