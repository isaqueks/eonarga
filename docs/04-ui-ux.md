# 04 — UI e UX

## Princípios de interface

- **Mobile-first**, largura base 390 px. Desktop é o mesmo layout com largura máxima ~720 px centralizada; o mapa ganha altura.
- **Navegação inferior** com 4 destinos + botão central de adicionar. Sem menu hambúrguer.
- **Uma ação primária por tela.** Ranking → abrir lugar. Ficha → avaliar. Novo lugar → salvar.
- **Tema escuro por padrão** (o meme é escuro; o mapa é escuro). Tema claro disponível no perfil.
- **Toque ≥ 44 px**, contraste AA, foco visível. Zoeira não é desculpa pra botão minúsculo.

## Mapa de navegação

```
Login ── Trocar senha (forçado na 1ª entrada)
└── App (exige sessão)
    ├── Ranking (home) ──┐
    ├── Mapa             ├── Ficha do lugar ── Avaliar / Editar avaliação
    ├── [+] Novo lugar ──┘                  └── Editar lugar
    ├── Rolê (quero ir / já fui / sortear na v2)
    └── Perfil ── Trocar senha
                └── Admin (só admin) ── Usuários / Categorias
```

Barra inferior: **Ranking · Mapa · [+] · Rolê · Perfil**.

## Telas

### Login

```
┌──────────────────────────┐
│                          │
│       [ cachorro ]       │
│       E o narga?         │
│                          │
│  Email                   │
│  ┌────────────────────┐  │
│  └────────────────────┘  │
│  Senha                   │
│  ┌────────────────────┐  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │ ☐ Não sou um robô  │  │  ← reCAPTCHA falso (ver 09)
│  │          🐶 reNARGA │  │
│  └────────────────────┘  │
│  ┌────────────────────┐  │
│  │       Entrar       │  │
│  └────────────────────┘  │
│  Sem conta? Pede pro     │
│  admin. Ele sabe quem é. │
└──────────────────────────┘
```

Erro genérico "Email ou senha errados" (não revela qual). Sem "esqueci a senha". Clicar em "Não sou um robô" abre o desafio de imagens temático; nenhuma resposta é conferida. Spec completa no [09](./09-captcha-de-zoeira.md).

### Ranking (home)

```
┌──────────────────────────┐
│ 🐶 E o narga?      🔍    │
│ [Todos][🍽️][🍺][📚][💨]… │  ← chips de categoria, rolagem horizontal
│ Ordenar: Melhores ▾      │
├──────────────────────────┤
│ 1  🍽️ Restaurante do Zé  │
│    ★ 4,7 · 6 notas  🏅   │
│    💨 tem narga          │
│    "Melhor PF do centro" │
├──────────────────────────┤
│ 2  📚 Sebo do João       │
│    ★ 4,5 · 4 notas       │
│    "Achei um Bukowski"   │
├──────────────────────────┤
│ …                        │
│ Ainda sem nota (3)     ▾ │
├──────────────────────────┤
│ Ranking  Mapa (+) Rolê 👤│
└──────────────────────────┘
```

- Cada card: posição, emoji da categoria, nome, nota média, nº de notas, "tem narga" quando sim, selo, e o veredito da avaliação mais recente como citação.
- Busca (🔍) filtra por nome/endereço, instantânea, sem ir ao servidor (a lista inteira já está na página).
- Chip de categoria persiste entre Ranking e Mapa (query string).

### Mapa

```
┌──────────────────────────┐
│ [Todos][🍽️][🍺][📚]…     │
│                          │
│      ●    ●              │
│   ●     (5)      ●       │  ← pinos coloridos por categoria, cluster
│              ●           │
│                     ◎    │  ← "onde estou"
│                          │
├──────────────────────────┤
│ 📚 Sebo do João  ★ 4,5   │  ← bottom sheet ao tocar num pino
│ Rua Felipe Schmidt, 123  │
│ [ Ver ficha ] [ Maps ↗ ] │
├──────────────────────────┤
│ Ranking  Mapa (+) Rolê 👤│
└──────────────────────────┘
```

- Visão inicial: Centro de Floripa, zoom 16 (aprox. `-27.5975, -48.5500`, região da Praça XV; ajustar olhando).
- Pino cinza = sem avaliação. Pino com brilho = "Aprovado pelo narga". Pino com contorno = "quero ir".

### Ficha do lugar

```
┌──────────────────────────┐
│ ←                    ⋯   │  ← editar / arquivar (autor ou admin)
│ 📚 Sebo do João          │
│ Sebo · $ · 💨 Não sei    │
│ ★★★★½ 4,5 (4)   🏅       │
│ [ Abrir no Maps ][ Ir ▶ ]│
│ [♡ Quero ir] [✓ Já fui]  │
│ ─────────────────────────│
│ Rua Felipe Schmidt, 123  │
│ @sebodojoao              │
│ Dicas: "Caixa dos R$5    │
│ perto da porta"          │
│ ─────────────────────────│
│ Já foram: Ana, Bia, Caio │
│ Querem ir: Dudu          │
│ ─────────────────────────│
│ ┌──────────────────────┐ │
│ │ ✍️ Dar minha nota    │ │  ← CTA primário se ainda não avaliei
│ └──────────────────────┘ │
│ Avaliações (4)           │
│ ┌ Ana · ★ 5 · há 2 dias  │
│ │ "Achei um Bukowski"    │
│ │ …texto rico…           │
│ │ 👍 2  😂 1   [reagir]  │
│ └────────────────────────│
└──────────────────────────┘
```

- O CTA vira **"✍️ Fui de novo? Dá outra nota"** pra quem já avaliou: cada visita rende uma avaliação nova (docs/08 #29). Com duas ou mais, um contador discreto embaixo do botão ("você já avaliou 2 vezes"). O "Editar" do menu ⋯ de cada card leva pra `avaliar?review=<id>`.
- "Abrir no Maps" usa `https://www.google.com/maps/search/?api=1&query=LAT,LNG` (ou o link original colado). "Ir" usa `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`. Nenhum dos dois precisa de chave.

### Novo lugar (3 passos, um por tela)

1. **Onde?**
   - Campo grande "Cole o link do Google Maps" com botão "Colar" (usa a API de clipboard).
   - Ou "Buscar por nome" (autocomplete via Photon, viés pra Floripa).
   - Ou "Estou aqui agora" (pede o GPS e já põe o pino na sua posição) / "Abrir o mapa" (pino arrastável no Centro); ao soltar, reverse geocoding preenche o endereço.
   - Ao resolver, mostra mini-mapa com o pino, nome sugerido e endereço. Dá pra corrigir o pino aqui.
2. **O quê?** Nome (pré-preenchido), categoria (grid de chips com emoji), "Tem narga?" (3 botões), preço ($ $$ $$$ $$$$), descrição, dicas, Instagram.
3. **Sua nota (opcional).** Mesmo formulário de avaliar. "Pular" salva só o lugar.

Progresso visível ("1 de 3"). Voltar preserva o que foi digitado. Se o link não resolver, mensagem clara: "Não consegui ler esse link. Marca no mapa?"

### Avaliar

```
┌──────────────────────────┐
│ ← Sebo do João           │
│ Sua nota                 │
│  🐶 🐶 🐶 🐶 🐶  4,5     │  ← toca/arrasta, meio ponto
│ Veredito em uma frase    │
│ ┌────────────────────┐   │
│ └────────────────────┘   │
│ Conta mais (opcional)    │
│ ┌────────────────────┐   │
│ │ B I S H2 • ≡ " 🔗  │   │  ← toolbar fixa no topo do editor
│ │                    │   │
│ │ editor…            │   │
│ └────────────────────┘   │
│ Quando foi?  [ hoje ▾ ]  │
│ ┌────────────────────┐   │
│ │      Publicar      │   │
│ └────────────────────┘   │
└──────────────────────────┘
```

- A nota usa o rosto do cachorro como "estrela" (5 cabeças; meia cabeça = meio ponto). Fallback: estrelas.
- Rascunho salvo em `localStorage` a cada mudança (celular fecha aba fácil). Ao voltar, "Continuar rascunho?".
- Limite de 5.000 caracteres no texto, contador discreto.

### Rolê

- Abas: **Quero ir** · **Já fui**. Mesmos cards do ranking, com os nomes de quem marcou embaixo ("Ana e Bia querem ir").
- Mostra o **grupo inteiro** por padrão; um chip "só eu" filtra pras minhas marcações. Nada é privado.
- Ordenação padrão em "Quero ir": mais pessoas querendo primeiro. É a lista de candidatos pro próximo rolê.
- Botão "🎲 Sortear" (v2): escolhe entre "quero ir" respeitando o chip de categoria, com animação rápida e "de novo".

### Feed

Ícone de atividade no header (`/feed`). Do topo pra baixo: título "Novidades", botão primário largo **"📸 Postar"** e a timeline.

- **Post** (card): avatar + nome, "há 5 min", linha "📍 no **Sebo do João**" (link pra ficha) ou "📍 Rua Felipe Schmidt, 123 - Centro" (link pro Maps, aba nova); a foto em largura total, na proporção original, e o texto embaixo respeitando as quebras de linha. Tocar na foto abre em tela cheia. Menu "⋯" com "Apagar" (com confirmação) pra quem postou e pro admin.
- **Avaliação** (card, mesmo peso visual): avatar + nome, "há x · visitou em 12/08", a mesma linha de localização, nargas + nota, o veredito em destaque e uma prévia do texto (~280 caracteres) com "… ver avaliação" levando pra ficha.
- **O resto** (lugar novo, "quero ir"/"já fui", reação, "chamar galera") continua como linha curta com avatar pequeno.
- "Carregar mais" pagina pelo `?before=` do último evento. Vazio: "Nada aconteceu ainda. / Vai lá fazer acontecer." — com o botão "Postar" ainda visível.

### Postar

Tela única (`/feed/novo`), tudo opcional menos o "onde":

1. **📷 Foto** — abre a câmera traseira direto (`capture="environment"`). Escolheu, aparece a prévia com um "Tirar" pra desistir.
2. **Texto** — "O que tá rolando?", cresce até ~6 linhas, contador `19/1000`.
3. **Onde você tá?** — três botões: **Onde estou** (padrão, já pede o GPS ao abrir), **Escolher lugar** (busca por nome, ordenada por distância quando tem GPS) e **Marcar no mapa** (pino arrastável). Perto de um lugar cadastrado, o GPS pergunta "Você tá no **Sebo do João**?" com "Sim" / "Não, só o endereço". Escolhido, vira uma linha "📍 …" com "Trocar" do lado. Sem GPS: "Sem GPS. Escolhe o lugar ou marca no mapa."
4. **Publicar** — desabilitado até ter o "onde" e pelo menos foto ou texto; embaixo, a explicação do que falta.

### Perfil

- Nome (editável), email, gênero e testosterona (regras por papel no [08](./08-decisoes-em-aberto.md) #25), botão "Trocar senha", toggle de tema, "Sair".
- Minhas avaliações e lugares que criei.
- Se admin: link "Administração".

### Admin

- **Usuários**: tabela (nome, email, papel, ativo, último login, nº de avaliações). Ações: novo, resetar senha, ativar/desativar, tornar admin. Ao criar/resetar, mostra a senha temporária **uma vez** com botão copiar.
- **Categorias**: lista reordenável, editar nome/emoji/cor, criar. Excluir só se não tiver lugar vinculado.

## Identidade visual

- **Logo/favicon**: `eonarga.jpg` (o cachorro). No header, recorte do rosto em círculo pequeno; no login e nos estados vazios, a imagem inteira com o texto.
- **Paleta** (proposta; ajustar olhando o jpg):
  - fundo `#0e1110`, superfície `#171c1a`, borda `#262d2a`
  - texto `#e8ece9`, texto secundário `#9aa39e`
  - acento `#8fd3b0` (verde-acinzentado do próprio meme), CTA `#f4b942` (âmbar, contraste alto no escuro)
  - perigo `#ff6b6b`
- **Tipografia**: `system-ui` pro corpo; o título "E o narga?" numa fonte display levemente cômica (ex.: Rubik Mono One), só no logo e no login.
- **Cores de categoria**: cada categoria tem sua cor; usada no pino, na chip e na borda esquerda do card.
- **Copy**: pt-BR informal, curto, com piada nos estados vazios, erros e onboarding. Formulários e confirmações destrutivas são sérios ("Arquivar Sebo do João? Some do ranking, avaliações ficam.").

## Estados vazios e erros

| Situação                | Texto                                                           |
| ----------------------- | --------------------------------------------------------------- |
| Ranking vazio           | "Nenhum lugar ainda. E o narga?" + botão "Adicionar o primeiro" |
| Sem resultado no filtro | "Nada com esse filtro. Bora descobrir?"                         |
| Lugar sem avaliação     | "Ninguém deu nota. Seja o primeiro (ou o culpado)."             |
| Quero ir vazio          | "Lista vazia. Isso é sério?"                                    |
| Offline                 | "Sem internet. E o narga? Fica pra depois."                     |
| 404                     | "Esse lugar não existe. Ou fechou. Ou nunca existiu."           |
| Erro 500                | "Deu ruim do nosso lado. Tenta de novo."                        |

## Acessibilidade

- Nota com `role="slider"`, setas do teclado e `aria-valuetext="4,5 de 5"`.
- Mapa tem alternativa textual: a lista do ranking é a mesma informação.
- Editor com labels nos botões e atalhos de teclado padrão (Ctrl+B etc.).
- `prefers-reduced-motion` respeitado na roleta e nas transições.
- Zoom do navegador nunca bloqueado.
