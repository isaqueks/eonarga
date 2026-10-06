# 02 — Stack e arquitetura

## Critérios

O app é pequeno (dezenas de usuários no máximo, centenas de lugares), interno e sem SLA. Então:

1. **Um repositório, um container.** Front e back juntos.
2. **Sem serviço pago obrigatório.** Nada de chave de API com cartão de crédito no caminho crítico.
3. **Dados fáceis de levar embora.** Um arquivo `.db` e uma pasta de uploads.
4. **Ecossistema conhecido.** Se alguém do grupo quiser mexer, que seja em algo googlável.

## Stack proposta

| Camada              | Escolha                                                                            | Alternativa considerada                 | Motivo                                                                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework           | **Next.js** (App Router, Server Actions, TypeScript)                               | SvelteKit; Vite SPA + Hono              | Um só projeto, render no servidor, ecossistema maior pra Tiptap, mapa e PWA. SvelteKit seria mais leve e é boa alternativa se você preferir                                   |
| UI                  | **Tailwind CSS v4 + shadcn/ui**                                                    | Mantine, DaisyUI                        | Componentes acessíveis, fáceis de customizar pro visual "meme"                                                                                                                |
| Banco               | **Postgres 18** via **Drizzle ORM** (driver `pg`); **PGlite** em dev, teste e e2e  | SQLite (foi assim até a 0.18.x); Prisma | Banco de verdade, com `pg_dump` e concorrência de gente grande. Em dev nada pra instalar: o PGlite (Postgres em wasm) sobe embutido e roda as mesmas migrations (docs/08 #55) |
| Auth                | **Sessão própria** (cookie httpOnly + tabela `sessions`) + **argon2**              | Auth.js (credentials)                   | Auth.js complica o caso "admin cria usuário sem email". Sessão em banco são ~100 linhas e dá controle total                                                                   |
| Mapa                | **Leaflet** + `react-leaflet` + `leaflet.markercluster`                            | MapLibre GL + OpenFreeMap               | Leaflet é mais simples e leve pra pinos. MapLibre vale se quiser mapa vetorial mais bonito                                                                                    |
| Tiles               | **OpenStreetMap** padrão + filtro CSS (`invert` + `hue-rotate`) no tema escuro     | CARTO Dark Matter; OpenFreeMap          | A CARTO passou a exigir API key (tiles vêm com marca d'água). OSM é grátis pra uso baixo com atribuição                                                                       |
| Geocoding (busca)   | **Photon** (komoot, base OSM, feito pra autocomplete)                              | Nominatim; Google Places                | Grátis. Nominatim **proíbe** autocomplete na política de uso; Photon não. Cobertura de lojinha pequena é fraca em ambos, por isso "colar link do Maps" é o caminho principal  |
| Geocoding (reverso) | **Nominatim** (toque no mapa → endereço)                                           | Photon reverse                          | 1 req/s, com User-Agent identificado, via proxy no servidor                                                                                                                   |
| Google Maps         | **Deep links** (abrir, rota) + **resolução de link compartilhado** no servidor     | Places API (New) com chave              | Cobre abrir, navegar e importar. Places API fica opcional atrás de env var                                                                                                    |
| Editor              | **Tiptap v3** (ProseMirror)                                                        | Milkdown (markdown-nativo); Lexical     | WYSIWYG maduro, mobile ok, atalhos markdown nativos. Salva HTML sanitizado                                                                                                    |
| Sanitização         | `sanitize-html` com allowlist espelhando as extensões do Tiptap                    | DOMPurify (isomorphic)                  | Roda no servidor sem DOM                                                                                                                                                      |
| Validação           | **Zod**                                                                            | Valibot                                 | Padrão                                                                                                                                                                        |
| Imagens (v2)        | **sharp** (redimensionar, remover EXIF, gerar thumb, converter pra webp)           | —                                       | Padrão; também gera os ícones do PWA                                                                                                                                          |
| PWA                 | **Serwist** (`@serwist/next`)                                                      | `next-pwa` (abandonado); Workbox manual | Sucessor mantido do next-pwa                                                                                                                                                  |
| Datas               | `date-fns` com locale `ptBR`                                                       | dayjs                                   | "há 2 dias", "ontem"                                                                                                                                                          |
| Testes              | **Vitest** (ranking, sanitização, parser de link) + **Playwright** (1 fluxo smoke) | —                                       | Pouco teste, mas nos pontos que quebram em silêncio                                                                                                                           |
| Lint/format         | ESLint + Prettier                                                                  | Biome                                   | Padrão do Next                                                                                                                                                                |
| Runtime             | Node 22 (já instalado) + **npm**                                                   | pnpm                                    | pnpm exige corepack, que no Windows pede admin pra criar os shims; npm já está lá e o projeto é pequeno                                                                       |
| Deploy              | **Docker Compose** (app + Caddy)                                                   | Vercel + Turso + R2                     | Ver "Hospedagem"                                                                                                                                                              |

### Por que não Supabase/Firebase

Resolveriam auth e banco, mas "admin cria usuário com senha" vira gambiarra com service key, e o app ficaria preso a um serviço. O ganho não paga.

### Por que não markdown puro no banco

Tiptap trabalha com JSON/HTML. Dá pra serializar markdown (`tiptap-markdown`), mas o round-trip perde coisas (imagem com tamanho, alinhamento). Guardamos **HTML sanitizado** como fonte da verdade e, se um dia quiser exportar, converte com `turndown`. O usuário não vê diferença: digita `**assim**` e vira negrito na hora.

## Arquitetura

```mermaid
flowchart LR
  subgraph Celular
    PWA["PWA (Next client + service worker)"]
  end
  subgraph VPS["VPS (Docker Compose)"]
    Caddy["Caddy (HTTPS automático)"] --> App["Next.js (SSR + Server Actions + Route Handlers)"]
    App --> DB[("Postgres 18 (container eonarga-db)")]
    App --> Files["Uploads em disco (v2)"]
  end
  PWA -- HTTPS --> Caddy
  PWA -- tiles --> OSM[("OpenStreetMap tiles")]
  App -- busca --> Photon[("Photon")]
  App -- reverso --> Nominatim[("Nominatim")]
  App -- resolve link --> GMaps[("maps.app.goo.gl")]
```

- **Tudo passa pelo servidor Next.** Não há API pública; o cliente chama Server Actions (mutações) e páginas SSR (leitura). Route Handlers só pra upload, servir imagens e os proxies de geocoding.
- **Geocoding e resolução de link são proxied** pelo servidor: aplica o User-Agent exigido, rate limit, cache, e evita CORS.
- **Mapa carrega tiles direto** do provedor (é o padrão, e o service worker pode cachear).

## Estrutura do repositório

Raiz = esta pasta (`narga/`).

```
.
├── docs/                      # este plano
├── public/
│   ├── icons/                 # gerados a partir de eonarga.jpg (ver 06)
│   └── logo.jpg               # cópia do eonarga.jpg
├── src/
│   ├── app/
│   │   ├── (auth)/login/
│   │   ├── (auth)/trocar-senha/
│   │   ├── (app)/             # layout com navegação inferior, exige sessão
│   │   │   ├── page.tsx       # = ranking
│   │   │   ├── mapa/
│   │   │   ├── lugares/novo/
│   │   │   ├── lugares/[slug]/
│   │   │   ├── lugares/[slug]/avaliar/
│   │   │   ├── lugares/[slug]/editar/
│   │   │   ├── role/          # quero ir / já fui (+ sortear na v2)
│   │   │   ├── perfil/
│   │   │   └── admin/{usuarios,categorias}/
│   │   ├── api/
│   │   │   ├── geocode/       # proxy Photon + Nominatim
│   │   │   ├── maps-link/     # resolve link do Google Maps
│   │   │   └── uploads/       # v2: recebe e serve imagens
│   │   ├── manifest.ts
│   │   ├── sw.ts              # Serwist
│   │   └── ~offline/
│   ├── components/
│   │   ├── ui/                # shadcn
│   │   ├── map/               # Leaflet (dynamic import, sem SSR)
│   │   ├── editor/            # Tiptap + toolbar
│   │   ├── places/
│   │   └── reviews/
│   ├── actions/               # server actions por domínio (places, reviews, users...)
│   └── lib/
│       ├── db/                # client.ts, schema.ts, migrations/, seed.ts
│       ├── auth/              # session.ts, password.ts, guards.ts
│       ├── ranking.ts
│       ├── sanitize.ts
│       ├── maps-link.ts       # parser de links do Google Maps
│       ├── geocode.ts
│       └── storage.ts         # adapter: disco local (S3/R2 no futuro)
├── scripts/
│   └── generate-icons.ts      # sharp: jpg → ícones PWA/favicon
├── data/                      # volume: eonarga.db + uploads/ (gitignored)
├── Dockerfile
├── compose.yml
├── Caddyfile
├── .env.example
└── package.json
```

## Variáveis de ambiente

| Var                                             | Exemplo                                 | Obrigatória                         |
| ----------------------------------------------- | --------------------------------------- | ----------------------------------- |
| `DATABASE_URL`                                  | `file:./data/eonarga.db`                | sim                                 |
| `UPLOAD_DIR`                                    | `./data/uploads`                        | v2                                  |
| `APP_URL`                                       | `https://narga.schlutersolucoes.com.br` | sim (prod)                          |
| `NEXT_PUBLIC_CAPTCHA_MODE`                      | `always` \| `off`                       | não (padrão `always`; `off` em dev) |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | usados só no primeiro seed              | sim (1ª vez)                        |
| `MAP_CENTER`                                    | `-27.5975,-48.5500`                     | não (padrão = Centro)               |
| `TILE_URL`                                      | URL do provedor de tiles                | não                                 |
| `GEOCODE_USER_AGENT`                            | `eonarga/1.0 (seu-email)`               | sim (política do Nominatim)         |
| `GOOGLE_MAPS_API_KEY`                           | —                                       | não (habilita Places Autocomplete)  |

## Hospedagem

**Decidido (02/09/2026): VPS próprio, domínio `eonarga.com.br` (atrás do proxy da Cloudflare). Em 27/09/2026 o app mudou pra uma VPS só dele (Ubuntu 24, 4 vCPU / 8 GB, Docker) e na 0.19.0 o banco virou Postgres (docs/08 #55).**

### Como está de fato no ar

- **Caddy do sistema** nas portas 80/443 (`/etc/caddy/Caddyfile`), no padrão Cloudflare: bloco `http://eonarga.com.br` e bloco `https://eonarga.com.br` com `tls internal` (Cloudflare em Full não-estrito), os dois com `encode zstd gzip` e `reverse_proxy 127.0.0.1:3010`. Ficou fora do compose de propósito: é o que já estava configurado e funcionando quando a VPS foi montada.
- `compose.prod.yml` em `/opt/eonarga`, com dois containers: `eonarga` (o app, imagem `eonarga:<versão>`, em `127.0.0.1:3010`) e `eonarga-db` (Postgres 18, só na rede interna do compose, sem porta no host; senha em `POSTGRES_PASSWORD` no `.env`, `--builtin-locale=C.UTF-8` pra ordenar por byte como o SQLite fazia e igual ao PGlite dos testes). Volumes: `app_data` (uploads; o `eonarga.db` antigo continua lá como fallback) e `pg_data`.
- **Deploy** (`deploy/build-and-up.sh`): a máquina de dev manda um `git archive` da tag pra `/opt/eonarga/src/<versão>`, e a VPS constrói a imagem ali (4 vCPU dão conta do `next build`), grava `EONARGA_TAG` no `.env`, sobe o compose, espera o `/api/health` responder com a versão nova e apaga imagens e fontes antigos (ficam os 2 últimos). Migrations e seed rodam no start (`src/instrumentation.ts`), que também liga a varredura de flop (`src/lib/flop.ts`, a cada 5 min no mesmo processo — sem cron fora do container).
- **Backup** (`deploy/backup.sh`, cron às 4h17 via `deploy/eonarga-backup.cron`): `pg_dump -Fc` diário em `/opt/eonarga/backups/db` (14 dias) e espelho `rsync` dos uploads em `/opt/eonarga/backups/uploads`. É cópia no mesmo disco; de tempos em tempos vale copiar a pasta pra fora da máquina. Restaurar: `docker exec -i eonarga-db pg_restore -U eonarga -d eonarga --clean --if-exists < eonarga-<data>.dump`.
- **Migração SQLite → Postgres** (feita em 28/09/2026, reproduzível): `sqlite3 -json` de cada tabela (num container `alpine` com o volume montado) → `npm run db:import-sqlite <pasta> saida.sql` (`scripts/sqlite-dump-to-sql.ts`: tabelas em ordem de FK, 0/1 → boolean, `TRUNCATE` antes) → `psql -v ON_ERROR_STOP=1 -1 -f`. `npx tsx scripts/sqlite-dump-check.ts <pasta>` ensaia tudo num PGlite descartável e compara as contagens antes de encostar em produção.

A VPS antiga (compartilhada) ainda tem o bloco do `eonarga.com.br` no Caddy dela apontando pra um container que não existe mais; pode ser removido quando der.

### Alternativa: VPS só nosso (compose.yml com Caddy próprio)

- Qualquer VPS Linux com Docker (1 vCPU / 1 GB sobra). Portas 80 e 443 abertas.
- `compose.yml`: serviço `app` (imagem multi-stage do Next em modo `standalone`) + `caddy` (HTTPS via Let's Encrypt).
- Volumes nomeados `app_data` (uploads, montado em `/app/data`), `pg_data` (Postgres) e `caddy_data` (certificados). Volume nomeado em vez de bind mount porque o container roda como usuário sem privilégio e o Docker já cria o volume com o dono certo.
- Backup: o mesmo `deploy/backup.sh` (pg_dump + rsync dos uploads), de preferência copiado pra um bucket depois.
- PWA exige HTTPS; Caddy resolve.

### DNS (ainda não configurado)

No painel do `schlutersolucoes.com.br`, criar:

| Tipo | Nome    | Valor                 |
| ---- | ------- | --------------------- |
| A    | `narga` | IPv4 do VPS           |
| AAAA | `narga` | IPv6 do VPS, se tiver |

Se o DNS for Cloudflare, deixar o registro em "DNS only" (nuvem cinza). Com o proxy laranja o Caddy não consegue emitir o certificado pelo desafio HTTP sem ajuste extra; não vale a complexidade.

### Caddyfile

```
narga.schlutersolucoes.com.br {
    encode zstd gzip
    reverse_proxy app:3000
}
```

Só isso. Caddy emite e renova o certificado sozinho.

### Alternativa descartada: Vercel + Turso + R2

Zero servidor, mas três serviços pra configurar e fotos fora do "um arquivo, uma pasta". O código continua compatível (troca `DATABASE_URL` e o adapter de storage) caso mude de ideia.

## Ambiente de desenvolvimento

```bash
npm install
cp .env.example .env          # preencher ADMIN_*
npm run db:migrate && npm run db:seed
npm run dev                   # http://localhost:3000
npm run icons                 # gera public/icons a partir de eonarga.jpg
```

- `localhost` conta como contexto seguro: PWA e service worker funcionam em dev sem HTTPS.
- Pra testar no celular na mesma rede, `npm run dev -- -H 0.0.0.0` e abrir pelo IP. Aí o SW não registra (sem HTTPS); pra testar instalação de verdade, `docker compose up` com Caddy, ou um túnel (`cloudflared tunnel --url http://localhost:3000`).
- Windows: `sharp` e `@node-rs/argon2` têm binários prontos pra win32-x64; `pg` é JS puro e o PGlite é wasm. Não precisa de toolchain C.
- Banco em dev: sem `DATABASE_URL`, o app usa o PGlite em `./data/pglite` (uma pasta, some com `rm -rf`). Cada arquivo de teste sobe o seu em memória; o e2e usa `./data/e2e-pglite`. Pra apontar pra um Postgres de verdade, `DATABASE_URL=postgres://…`.
- Depurar: `EONARGA_SQL_LOG=1` imprime cada query no console do servidor (qualquer outro valor é um arquivo que recebe uma linha por query, com a hora). No e2e, `E2E_SERVER_LOG=1` mostra também o stdout do servidor de dev (uma linha por request e por server action). Foi com os dois que se viu que o engasgo ocasional de um `page.reload()` no e2e não é banco preso: o servidor segue respondendo e a navegação seguinte passa (por isso o `recarregar()` do `e2e/smoke.spec.ts` desiste em 20 s e navega de novo).
