# 05 — Auth, admin e segurança

## Modelo

- **Sem cadastro aberto.** Contas nascem no painel admin.
- **Dois papéis**: `admin` e `member`. Admin faz tudo que member faz.
- **Tudo atrás de login.** Nenhuma rota do app é pública além de `/login`, o manifest, os ícones e a página offline.

## Sessões

1. Login valida email + senha (argon2id via `@node-rs/argon2`, parâmetros recomendados pela OWASP).
2. Gera token aleatório (32 bytes), grava `sha256(token)` em `sessions` com `expires_at = agora + 30 dias`.
3. Cookie `eonarga_session`: `HttpOnly; Secure; SameSite=Lax; Path=/`.
4. Em cada request, `middleware.ts` só checa se o cookie existe (barato, roda no edge). Páginas e actions chamam `getSession()`, que valida no banco e renova se passou da metade da vida.
5. Logout apaga a linha e o cookie. "Sair de todos os aparelhos" apaga todas as linhas do usuário (v2, no perfil).

Por que não JWT: sessão em banco permite revogar (desativar usuário derruba na hora) e é mais simples de raciocinar.

## Senhas

- Mínimo 8 caracteres; sem outras regras chatas. Checagem contra lista curta de senhas óbvias (`12345678`, `senha123`, `eonarga`...).
- Admin cria usuário com **senha temporária gerada** (3 palavras + número, ex.: `sebo-narga-praca-42`), exibida uma única vez. `must_change_password = true` força a troca no primeiro login (redirect pra `/trocar-senha` até resolver).
- Resetar senha = mesmo fluxo. Não existe "esqueci a senha" por email: o usuário fala com o admin. Pra 10 pessoas, é o fluxo certo.
- Troca de senha exige a senha atual e invalida as outras sessões.

## Permissões

| Ação                                                   | member       | admin                                   |
| ------------------------------------------------------ | ------------ | --------------------------------------- |
| Ver tudo                                               | ✓            | ✓                                       |
| Criar lugar / avaliação / status / reação              | ✓            | ✓                                       |
| Editar "Tem narga?", dicas, endereço de qualquer lugar | ✓            | ✓                                       |
| Renomear, mudar categoria, arquivar lugar              | só se criou  | ✓                                       |
| Editar / apagar avaliação                              | só a própria | ✓ (apagar)                              |
| Gerenciar categorias                                   |              | ✓                                       |
| Gerenciar usuários                                     |              | ✓                                       |
| Tornar alguém admin / remover admin                    |              | ✓ (não pode se remover se for o último) |

Checagem sempre no servidor, dentro da server action, via `requireUser()` / `requireAdmin()`. A UI esconde botões, mas isso é cosmético.

## Painel admin

### Usuários

- Criar: nome, email (único, normalizado em lower-case), senha gerada.
- Resetar senha, ativar/desativar, tornar admin / tirar admin.
- **Não apaga usuário.** Desativa. O conteúdo fica com o nome, porque o histórico do grupo importa. Se alguém pedir pra sumir, o admin renomeia pra "Ex-membro".

### Categorias

- CRUD com emoji, cor, ordem. Excluir só sem lugares vinculados.

### Primeiro admin

`npm run db:seed` lê `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`. Se já existe algum admin, não faz nada. O container roda isso no start.

## Proteções

| Risco                             | Medida                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Força bruta no login              | Rate limit: 5 tentativas / 15 min por (email + IP), em memória (uma instância só). Resposta sempre genérica                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Captcha falso no login            | **Não é proteção.** É piada ([09](./09-captcha-de-zoeira.md)): roda só no cliente e aceita qualquer resposta. O servidor nem sabe que existe. Não confundir com controle de segurança                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| XSS via editor                    | `sanitize-html` no servidor com allowlist: `p, br, strong, em, s, u, h2, h3, ul, ol, li, blockquote, a[href,rel,target], img[src,alt,width,height], code, pre`. `href` só `http(s):` e `mailto:`; `a` ganha `rel="noopener noreferrer"`. `img src` só do próprio domínio. Sanitiza **na gravação**; o render usa o HTML já limpo                                                                                                                                                                                                                                                                                                                                                      |
| CSRF                              | Server Actions do Next checam `Origin`. Route Handlers de mutação (upload) checam `Origin` manualmente e exigem sessão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| SSRF no "colar link do Maps"      | Só aceita hosts `maps.app.goo.gl`, `goo.gl`, `maps.google.com`, `www.google.com` (path `/maps`). Segue no máximo 3 redirects, cada um revalidado contra a allowlist, timeout 5 s, sem cookies, resposta lida só até 256 KB                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Upload malicioso (v2)             | Aceita só `image/jpeg, png, webp, heic`; confere magic bytes; máx. 10 MB; **reprocessa** com sharp (gera webp novo, o que destrói payload e remove EXIF/GPS); nome de arquivo = id gerado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Enumeração de usuários            | Login responde igual pra email inexistente e senha errada, com hash "dummy" pra tempo parecido                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Cookies                           | `Secure` em prod, `HttpOnly`, `SameSite=Lax`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Headers                           | Em `next.config.ts` pra todas as rotas: CSP com `default-src 'self'`, `script-src 'self' 'unsafe-inline'` (+ hosts da Cloudflare; sem nonce porque App Router e next-themes usam script inline), `img-src 'self' data: blob: https://tile.openstreetmap.org`, `connect-src 'self' https://tile.openstreetmap.org` (a CSP vale também pro `sw.js`, e o worker busca os tiles via `fetch`), `worker-src 'self' blob:`, `frame-ancestors 'none'`, `form-action 'self'`, `object-src 'none'`; mais `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: geolocation=(self), camera=(self), microphone=()` |
| Abuso do geocoding                | Proxy no servidor com `User-Agent` identificado; Photon pra autocomplete (debounce 400 ms, mínimo 3 caracteres); Nominatim só pra reverse, 1 req/s global; cache de 24 h por query                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Dependências                      | `npm audit` no CI; Dependabot/Renovate mensal                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Banco corrompido / servidor sumiu | Backup diário (ver [02](./02-stack-e-arquitetura.md#hospedagem)); testar o restore uma vez antes de confiar                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Privacidade (pra galera)

- **Dentro do grupo, nada é privado**: quem marcou "quero ir", quem já foi, avaliações e reações são visíveis pra todo mundo logado. É a regra do app, não um descuido. Só a senha é segredo.
- Geolocalização só sob demanda (botão "onde estou"), nunca gravada.
- Fotos perdem EXIF (inclusive GPS) no upload.
- Sem analytics de terceiros. Se quiser saber uso, é `SELECT count(*)`.

## Importar do Instagram (docs/08 #37)

- O servidor faz dois fetches: a página de embed do post (`instagram.com`, URL montada a partir do código do post, nunca da URL colada) e a imagem, cuja URL vem do HTML do Instagram e **só passa se for https na CDN deles** (`*.cdninstagram.com`, `*.fbcdn.net`) — anti-SSRF. `redirect: "manual"`, 10 s de prazo, 3 MB de HTML e 10 MB de imagem no máximo.
- A imagem é reprocessada pelo sharp como qualquer upload (webp, sem EXIF, magic bytes conferidos).
- Foto importada fica "no palco" em memória por 30 min, só pra quem importou; o que vence tem os arquivos apagados. 10 importações por 10 min por pessoa.
- User-agent honesto (`EONargaBot/1.0`): o Instagram entrega HTML renderizado pra quem não é navegador. Se mudarem isso, a importação quebra e o caminho manual continua.

## Vídeo em post (docs/08 #39)

- Tipo pelos magic bytes (`ftyp` com marca conhecida = MP4/MOV; EBML com doctype `webm`), nunca pelo `Content-Type`. Matroska, HEIC e o resto caem fora.
- Guardado como veio, sem transcodificar (não tem ffmpeg na imagem; a VPS não aguentaria). 60 MB no máximo; o formulário confere antes de subir e a action confere de novo. `bodySizeLimit` das server actions em 64 MB.
- Servido só com sessão por `/api/videos/<id>.<ext>`, com Range (206) e `nosniff`. Reel importado chega em stream direto pro disco, com teto; passou, apaga o parcial.
