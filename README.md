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
| `npm run db:studio`                      | Drizzle Studio pra olhar o banco                           |
| `npm run icons`                          | Regenera favicon e ícones do PWA a partir do `eonarga.jpg` |

## Produção

Dois jeitos, conforme o servidor:

**VPS só nosso** (`compose.yml`): sobe o app e um Caddy que emite o certificado sozinho.

```bash
cp .env.example .env      # valores de produção; SITE_ADDRESS é o domínio
docker compose up -d --build
```

**VPS que já tem um reverse proxy** (`compose.prod.yml`, é como está no ar em `eonarga.com.br`): sobe só o app em `127.0.0.1:3010`, e o proxy existente encaminha pra lá. A imagem é construída na máquina de dev, porque o VPS é pequeno:

```bash
docker build -t eonarga:0.1.0 .
docker save eonarga:0.1.0 | gzip > eonarga-0.1.0.tar.gz   # envie pro VPS
# no VPS:
docker load < eonarga-0.1.0.tar.gz
EONARGA_TAG=0.1.0 docker compose -f compose.prod.yml up -d
```

Migrations e seed rodam no start. Banco e uploads ficam no volume `app_data`. Backup:

```bash
docker compose -f compose.prod.yml exec app sh -c "cd /app/data && tar cz ." > backup-$(date +%F).tgz
```

Pra testar o `compose.yml` local sem domínio: `SITE_ADDRESS=localhost docker compose up --build` e abra `https://localhost` (aceite o certificado local do Caddy).

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
