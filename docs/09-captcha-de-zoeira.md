# 09 — Captcha de zoeira ("reNARGA")

## O que é

Um widget no login que imita o reCAPTCHA v2 do Google (a caixinha "Não sou um robô" e o desafio de imagens), só que todos os desafios são sobre narguilé e **nenhuma resposta é verificada**: qualquer coisa passa. É piada, não segurança. A proteção real do login continua sendo o rate limit do [05](./05-auth-admin-seguranca.md).

## Por que parecer real

A graça está no primeiro segundo: a pessoa acha que é o reCAPTCHA de verdade, lê "Selecione todas as imagens com narguilé" e entende. Então a fidelidade visual importa:

- Widget 304×78 px, fundo `#f9f9f9`, borda `#d3d3d3`, cantos 3 px, sombra leve.
- Checkbox 28×28 com borda `#c1c1c1`, spinner azul ao clicar, check verde `#009e2e` animado ao passar.
- Popup do desafio com header azul `#1a73e8`, texto branco, "Selecione todas as imagens com" pequeno e a palavra-chave em negrito grande.
- Grid 3×3 (ou 4×4) com gap de 4 px, tile selecionado ganha overlay branco, encolhe um pouco e mostra um check azul redondo no canto.
- Rodapé do popup: ícones de recarregar, áudio e info à esquerda, botão azul "VERIFICAR" à direita (vira "PULAR" quando nada está selecionado).
- Fonte Roboto (via `next/font`), rodapé "Privacidade · Termos" em 8 px cinza.

O que muda: o logo. No lugar do logo do reCAPTCHA, o cachorro do `eonarga.jpg` em círculo, com "reNARGA" embaixo, no mesmo lugar e tamanho. Trocar pra "reCAPTCHA" é uma string; a proposta é reNARGA porque a piada fica melhor quando a pessoa percebe depois de já ter caído. Links de "Privacidade" e "Termos" abrem `/termos`: "Não tem termos. E o narga?".

## Fluxo

1. Tela de login: email, senha, widget com checkbox vazio. Botão "Entrar" desabilitado até o widget "verificar" (só no cliente).
2. Clique no checkbox: spinner por 0,8 a 1,5 s (aleatório), depois abre o popup. **Sempre** abre; se passasse direto, a piada não apareceria.
3. Popup com um desafio sorteado da lista abaixo. Tocar num tile alterna a seleção.
4. Clique em VERIFICAR:
   - Nenhum tile selecionado, primeira vez: texto vermelho "Selecione todas as imagens correspondentes." e nada acontece. Na segunda vez, passa.
   - Caso contrário: spinner no botão por 0,6 s. Com 25% de chance aparece "Selecione também as imagens restantes." e 2 ou 3 tiles novos surgem com fade, uma vez só. Depois o popup fecha, o checkbox vira o check verde e "Entrar" habilita.
5. Ícone de recarregar: troca pra outro desafio.
6. Ícone de áudio: toca `public/captcha/e-o-narga.mp3` (alguém do grupo grava) e mostra "Digite o que você ouviu", campo que aceita qualquer coisa. Sem o arquivo: "Desafio de áudio indisponível. Tenta na visão mesmo."
7. Ícone de info: tooltip "Este site é protegido pelo reNARGA. Nenhum narguilé foi verificado."
8. Envio do formulário: só email e senha. O servidor não sabe que o captcha existe.

Tempo total adicionado ao login: uns 5 segundos. A sessão dura 30 dias, então isso acontece pouco.

## Desafios

Dois formatos, os mesmos do original:

- **A**: grid 3×3 com 9 fotos diferentes ("Selecione todas as imagens com X").
- **B**: uma foto grande dividida em 4×4 ("Selecione todos os quadrados com X"). O recorte é CSS (`background-position`), não precisa fatiar a imagem.

| #   | Prompt                                               | Formato | Tiles                                                                                                        | A piada                                           |
| --- | ---------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| 1   | Selecione todas as imagens com **narguilé**          | A       | Narguilés misturados com abajur, vaso, liquidificador, luminária de lava, garrafa térmica, extintor, samovar | Metade parece narguilé e não é                    |
| 2   | Selecione todos os quadrados com **carvão**          | B       | Foto de um rosh com carvão em brasa                                                                          | O mais próximo do original                        |
| 3   | Selecione todas as imagens com **fumaça**            | A       | Nuvem, névoa da Lagoa, chaminé, vape, incenso, churrasco, e o cachorro                                       | O cachorro não tem fumaça, mas as pessoas marcam  |
| 4   | Selecione todas as imagens com **mangueira**         | A       | Mangueira de narguilé, de jardim, a fruta manga, a árvore mangueira, bombeiro, tromba de elefante, cabo USB  | Todas são mangueira, dependendo do ponto de vista |
| 5   | Selecione todas as imagens com **o narga**           | A       | O `eonarga.jpg` em várias versões (recorte, invertido, filtro) misturado com outros cachorros e um gato      | Meta                                              |
| 6   | Selecione todas as imagens com **sebo**              | A       | Fachadas de sebos misturadas com vela de sebo, frigideira engordurada, testa oleosa                          | Trocadilho                                        |
| 7   | Selecione todas as imagens com **rosh**              | A       | Roshes, cinzeiros, canecas, vaso de bonsai, cuia de chimarrão                                                | Cuia de chimarrão é o tile que divide o grupo     |
| 8   | Selecione todos os quadrados com **a Figueira**      | B       | Foto da Praça XV                                                                                             | Local                                             |
| 9   | Selecione todas as imagens com **essência de menta** | A       | Oito caixas iguais de menta e uma de melancia                                                                | Absurdo                                           |
| 10  | Digite o texto acima                                 | texto   | Imagem com "E O NARGA" ondulado, estilo captcha de 2009                                                      | Nostalgia; aceita qualquer coisa                  |
| 11  | Selecione todas as imagens com **semáforos**         | A       | Só narguilés, nenhum semáforo                                                                                | O clássico invertido; a resposta certa é "Pular"  |
| 12  | Selecione todos os lugares onde **tem narga**        | A (v2)  | Fotos ou nomes dos lugares reais do app com `has_narga = yes` e `no`                                         | Vira quiz do próprio ranking                      |

Nove desafios no MVP (1, 3, 4, 5, 7, 9, 10, 11 e 2 ou 8 conforme houver foto). Adicionar um novo é acrescentar um item num array e uma pasta de imagens.

## Imagens (a parte trabalhosa)

- **MVP**: tiles em **ilustração SVG flat** gerada no código (silhueta, fundo colorido), mais o `eonarga.jpg`. Sem licença pra se preocupar, funciona offline, e o contraste com o visual "foto de rua" do reCAPTCHA é parte da piada.
- **Depois**: fotos reais. Quanto mais pessoal, mais engraçado: o grupo fotografa os próprios narguilés, roshes e carvões, e manda pra `public/captcha/<desafio>/`. Fotos de banco livre (Unsplash, Pexels) cobrem o resto.
- Formato: webp, 200×200 por tile no formato A; 400×400 no formato B.
- Desafio 5 é gerado com `sharp` a partir do `eonarga.jpg` no mesmo script dos ícones (recorte, espelho, inversão de cor, sépia).

## Implementação

- Componente cliente `NargaCaptcha` em `src/components/captcha/`, prop `onVerified()`. Estados: `idle → loading → challenge → verifying → verified`.
- Desafios em `src/lib/captcha/sets.ts`: `{ id, prompt, keyword, layout: 'grid9' | 'grid16' | 'text', tiles: [{ src, alt }] }`. Sorteio no `useEffect`, não no render, pra não dar erro de hidratação.
- Sem dependência nova. Animações em CSS puro. `prefers-reduced-motion` desliga zoom e fade.
- Acessibilidade: checkbox real com label; tiles são `button` com `aria-pressed`; popup com `role="dialog"`, foco preso, Esc fecha e volta pra "não verificado".
- Sem JavaScript, o formulário funciona sem captcha. Quem desliga JS não merece a piada.
- Variável pública `NEXT_PUBLIC_CAPTCHA_MODE=always | off` (`off` em dev e nos testes, exceto no teste de login do Playwright, que clica no captcha de propósito).
- Só no login. Tentação de colocar no "Publicar" da avaliação: não, vira chato.

## Decisões pequenas (proposta em negrito)

- Texto do logo: **reNARGA** ou reCAPTCHA.
- Frequência: **sempre** ou aleatório.
- Áudio: **quando alguém gravar**; até lá, mensagem de indisponível.
