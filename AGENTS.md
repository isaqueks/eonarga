<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# E o narga? — regras do projeto

- Leia `docs/README.md` antes de implementar qualquer coisa. O escopo, o modelo de dados, a UI e as decisões estão lá; não reinvente.
- Idioma: código e identificadores em inglês; toda copy visível ao usuário em pt-BR informal (ver tom em `docs/04-ui-ux.md`). Comentários em pt-BR.
- Gerenciador de pacotes: **npm** (não pnpm/yarn). Scripts em `package.json`.
- Next 16 (App Router, Turbopack): `proxy.ts` no lugar de `middleware.ts`; `cookies()`, `headers()`, `params`, `searchParams` são async; tipos `PageProps<'/rota'>` e `LayoutProps<'/rota'>` são globais.
- UI: Tailwind v4 + shadcn (preset `base-nova`, componentes em `src/components/ui`, adicionar com `npx shadcn@latest add <nome>`), ícones `lucide-react`. Tema escuro é o padrão (`<html class="dark">`); tokens em `src/app/globals.css`.
- Banco: SQLite via Drizzle (`src/lib/db/schema.ts`). Mudou o schema → `npm run db:generate` e commite a migration em `drizzle/`. IDs com `nanoid(12)`. Datas ISO em `text`; sete `updatedAt` manualmente nos UPDATEs.
- Mutações só por Server Actions (`src/actions/*`), sempre validando com Zod e checando permissão com `requireUser()` / `requireAdmin()` (`src/lib/auth/guards.ts`). Route Handlers só pra upload, imagens e proxies.
- Lógica pura (ranking, parsers, sanitização, auth) tem teste em Vitest ao lado do arquivo (`*.test.ts`).
- Antes de terminar: `npm run typecheck && npm run lint && npm test` passando.
- Nada é privado dentro do grupo (status, avaliações, reações). Só a senha.
