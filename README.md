# E o narga?

Ranking colaborativo (e zoeiro) de lugares do Centro de Floripa. PWA interno, só pra galera.

O plano completo está em [`docs/`](./docs/README.md). Comece por lá.

## Rodar local

Requisitos: Node 22+.

```bash
npm install
cp .env.example .env      # preencha ADMIN_NAME / ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev               # http://localhost:3000
```

No primeiro start o app aplica as migrations e cria as categorias e o admin (a partir do `.env`). Também dá pra fazer na mão:

```bash
npm run db:migrate
npm run db:seed
```

## Scripts

| Comando                                  | O que faz                                                  |
| ---------------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                            | Servidor de desenvolvimento                                |
| `npm run build` / `npm start`            | Build de produção e servidor                               |
| `npm run lint` / `npm run typecheck`     | ESLint e `tsc --noEmit`                                    |
| `npm test`                               | Vitest (lógica pura: ranking, sanitização, parsers)        |
| `npm run format`                         | Prettier                                                   |
| `npm run db:generate`                    | Gera migration a partir de `src/lib/db/schema.ts`          |
| `npm run db:migrate` / `npm run db:seed` | Aplica migrations / cria categorias e admin                |
| `npm run db:studio`                      | Drizzle Studio (precisa de um Postgres de verdade na URL)  |
| `npm run db:import-sqlite`               | Converte o dump JSON do SQLite antigo em SQL pro `psql`    |
| `npm run test:e2e`                       | Playwright: um fluxo inteiro num Chrome de celular         |
| `npm run icons`                          | Regenera favicon e ícones do PWA a partir do `eonarga.jpg` |

## Banco

Postgres via Drizzle. Em dev, teste e e2e não precisa instalar nada: sem `DATABASE_URL` o app usa o **PGlite** (Postgres em wasm) na pasta `./data/pglite`, com as mesmas migrations de produção. Pra usar um Postgres de verdade, `DATABASE_URL=postgres://usuario:senha@host:5432/banco`.

## Produção

Como está no ar em `eonarga.com.br` (detalhes em `docs/02`): VPS própria com Docker, Caddy do sistema nas portas 80/443 atrás da Cloudflare, e o `compose.prod.yml` subindo o app em `127.0.0.1:3010` mais um Postgres 18 que só o app enxerga. O `.env` da VPS precisa de `POSTGRES_PASSWORD` (`openssl rand -hex 24`) além das variáveis do `.env.example`.

Deploy — a imagem é construída na própria VPS:

```bash
# na máquina de dev
git archive --format=tar.gz -o eonarga-0.19.0.tar.gz HEAD        # envie pra /opt/eonarga/src/
# na VPS
mkdir -p /opt/eonarga/src/0.19.0 && tar xzf /opt/eonarga/src/eonarga-0.19.0.tar.gz -C /opt/eonarga/src/0.19.0
cp /opt/eonarga/src/0.19.0/compose.prod.yml /opt/eonarga/ && cp -r /opt/eonarga/src/0.19.0/deploy /opt/eonarga/
/opt/eonarga/deploy/build-and-up.sh 0.19.0
```

Migrations e seed rodam no start. Uploads ficam no volume `app_data`, o banco no `pg_data`. Backup diário: `deploy/backup.sh` (`pg_dump` + espelho dos uploads em `/opt/eonarga/backups`), instalado copiando `deploy/eonarga-backup.cron` pra `/etc/cron.d/eonarga-backup`. Restaurar o banco: `docker exec -i eonarga-db pg_restore -U eonarga -d eonarga --clean --if-exists < eonarga-<data>.dump`.

**VPS só nosso com Caddy próprio** (`compose.yml`): `cp .env.example .env` (com `SITE_ADDRESS` e `POSTGRES_PASSWORD`) e `docker compose up -d --build`. Pra testar local sem domínio: `SITE_ADDRESS=localhost docker compose up --build` e abra `https://localhost` (aceite o certificado local do Caddy).

Vindo de uma instalação com SQLite (até a 0.18.x)? O caminho está em `docs/08` #55: `sqlite3 -json` de cada tabela → `npm run db:import-sqlite <pasta> saida.sql` → `psql`; `npx tsx scripts/sqlite-dump-check.ts <pasta>` ensaia antes.

## Estrutura

```
docs/            plano e decisões
drizzle/         migrations geradas
public/icons/    ícones do PWA (gerados)
scripts/         migrate, seed, generate-icons
src/app/         rotas (App Router)
src/components/  UI
src/lib/db/      schema, client, seed
src/lib/         ranking, auth, sanitize, ...
```
