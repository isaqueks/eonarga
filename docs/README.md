# E o narga? — Documentação do projeto

> Ranking colaborativo (e zoeiro) de lugares do Centro de Floripa, pra uso interno entre amigos.

Este diretório é o plano do projeto: o que vamos construir, como, e em que ordem. Plano aprovado em 02/09/2026; o log de decisões fica no [08](./08-decisoes-em-aberto.md).

## Leia nesta ordem

| #   | Documento                                               | O que responde                                                 |
| --- | ------------------------------------------------------- | -------------------------------------------------------------- |
| 01  | [Produto e escopo](./01-produto.md)                     | O que o app faz, pra quem, o que fica de fora, ideias extras   |
| 02  | [Stack e arquitetura](./02-stack-e-arquitetura.md)      | Com o que construir, estrutura do repo, hospedagem             |
| 03  | [Modelo de dados](./03-modelo-de-dados.md)              | Tabelas, relações, algoritmo do ranking                        |
| 04  | [UI e UX](./04-ui-ux.md)                                | Navegação, telas, wireframes, identidade visual                |
| 05  | [Auth, admin e segurança](./05-auth-admin-seguranca.md) | Login, papéis, painel admin, proteções                         |
| 06  | [PWA e assets](./06-pwa-e-assets.md)                    | Manifest, ícones a partir do `eonarga.jpg`, service worker     |
| 07  | [Roadmap](./07-roadmap.md)                              | Fases, checklist, definição de pronto                          |
| 08  | [Decisões (log)](./08-decisoes-em-aberto.md)            | O que foi decidido, quando, e o pouco que ainda está em aberto |
| 09  | [Captcha de zoeira](./09-captcha-de-zoeira.md)          | O reCAPTCHA falso do login: visual, fluxo, lista de desafios   |

## Resumo em 30 segundos

- **O que é**: um PWA onde a galera cadastra lugares (restaurante, sebo, livraria, loja...), dá nota, escreve avaliação num editor visual e vê tudo num ranking e num mapa.
- **Quem usa**: só o grupo. Não tem cadastro aberto; um admin cria as contas (nome, email, senha).
- **Onde**: foco no Centro de Florianópolis, mas sem trava geográfica.
- **Tom**: shitpost. O cachorro do `eonarga.jpg` é logo, favicon e mascote dos estados vazios.

## Decisões-chave (aprovadas em 02/09/2026; detalhes no [08](./08-decisoes-em-aberto.md))

| Tema              | Decisão                                                                                                                               | Por quê                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Framework         | Next.js (App Router) + TypeScript                                                                                                     | Um repo só, SSR + server actions, ecossistema grande pra editor, mapa e PWA    |
| Banco             | SQLite via Drizzle ORM (libsql)                                                                                                       | Zero infra, backup = copiar um arquivo, compatível com Turso se for pra Vercel |
| Mapa              | Leaflet + tiles OpenStreetMap com filtro escuro em CSS                                                                                | Grátis, sem chave; a CARTO passou a exigir API key                             |
| Google Maps       | Deep links + colar link compartilhado do Maps                                                                                         | Resolve quase todo o uso sem API key; Places API fica opcional                 |
| Busca de endereço | Photon (OSM) pra autocomplete, Nominatim pra reverse                                                                                  | Grátis; Nominatim proíbe autocomplete, Photon foi feito pra isso               |
| Editor            | Tiptap (WYSIWYG com atalhos markdown)                                                                                                 | Visual, funciona bem no celular, salva HTML sanitizado                         |
| Auth              | Sessão em cookie + argon2, sem cadastro aberto                                                                                        | Simples, sem email transacional                                                |
| PWA               | Service worker escrito à mão (`public/sw.js`) + manifest + ícones gerados do jpg                                                      | Instalável no celular, offline básico; Serwist é webpack e o build é Turbopack |
| Hospedagem        | VPS próprio já compartilhado com outros projetos: app em Docker atrás do Caddy que existe lá, domínio `eonarga.com.br` via Cloudflare | Uploads em disco, sem mexer no que já roda                                     |
| Nota              | 1 a 5 "nargas", com meio ponto                                                                                                        | Familiar; ranking usa média bayesiana pra não premiar lugar com uma nota só    |
| Privacidade       | Nada é privado dentro do grupo: "quero ir", "já fui", avaliações, reações                                                             | É um caderninho compartilhado, não uma rede social                             |
| Captcha           | reCAPTCHA falso temático no login ("selecione todas as imagens com narguilé")                                                         | Zoeira. Não valida nada; a proteção real é o rate limit                        |

## Status

- [x] Plano escrito
- [x] Decisões respondidas (02/09/2026)
- [x] Fases 0 a 4 no ar em `eonarga.com.br`
- [x] Fase 6 (v2) entregue em 02/09/2026
- [ ] Instalar de fato num Android e num iPhone; testar "colar link do Maps" com links reais do grupo
