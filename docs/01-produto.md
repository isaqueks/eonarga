# 01 — Produto e escopo

## Visão

"E o narga?" é o caderninho compartilhado do grupo: onde a gente já foi no Centro, se valeu a pena, o que pedir, o que evitar e, a pergunta que dá nome ao app, se tem narga.

Não é Google Reviews. Não tem público, não tem SEO, não tem moderação. É pra meia dúzia de amigos usarem no celular, na rua, entre um rolê e outro.

## Pra quem

- **Membro**: qualquer pessoa do grupo. Cadastra lugar, avalia, reage, marca "quero ir".
- **Admin**: quem cuida das contas e das categorias. Provavelmente você. Também é membro.

Não existe visitante anônimo: tudo exige login.

## Princípios

1. **Celular primeiro.** A tela principal é a de um telefone, na rua, com sol na cara. Botões grandes, poucas etapas.
2. **Adicionar um lugar em menos de 1 minuto.** Colar link do Google Maps, escolher categoria, salvar. O resto é opcional.
3. **Zoeira no texto, seriedade no dado.** Copy engraçada, mas nota e ranking confiáveis.
4. **Zero manutenção.** Um arquivo de banco, uma pasta de uploads, um container. Sem serviço pago obrigatório.

## Funcionalidades — MVP (v1)

### Lugares

- Cadastrar lugar com: nome, categoria (obrigatória), endereço, posição no mapa, descrição curta, dicas, faixa de preço ($ a $$$$), **"Tem narga?"** (sim / não / não sei), links (Google Maps, Instagram, site).
- Três jeitos de informar onde fica, do mais fácil ao mais manual:
  1. **Colar link do Google Maps** (o link de "compartilhar" do app). O servidor resolve o link e extrai nome + coordenadas.
  2. **Buscar por nome ou endereço** (geocoding OpenStreetMap, com viés pra região de Floripa).
  3. **Tocar no mapa** e arrastar o pino.
- Editar e arquivar lugar (quem criou, ou admin). Arquivado some do ranking e do mapa, mas mantém as avaliações.
- Ficha do lugar: nota média, quantidade de avaliações, categoria, "Tem narga?", botões **Abrir no Google Maps** e **Como chegar**, lista de avaliações, quem já foi e quem quer ir.

### Categorias

- Lista inicial: Restaurante, Bar, Café, Lanchonete, Sebo, Livraria, Loja, Tabacaria, Outro. Cada uma com emoji e cor (usados nos pinos do mapa e nas chips).
- Um lugar tem exatamente uma categoria. Admin gerencia a lista.

### Avaliações

- **Uma avaliação por visita**: dá pra avaliar o mesmo lugar várias vezes; cada uma é editável (nota, veredito, texto e data da visita são independentes).
- Nota de 1 a 5 nargas, com meio ponto.
- **Veredito em uma frase** (obrigatório, curto). Vira a citação que aparece no card do ranking.
- Texto livre em editor visual (negrito, itálico, títulos, listas, citação, link). Atalhos de markdown funcionam (`**negrito**`, `- lista`, `# título`) e colar markdown também.
- Data da visita (opcional, padrão hoje).
- Reações com emoji nas avaliações dos outros.

### Ranking

- Lista ordenada por média bayesiana (ver [03](./03-modelo-de-dados.md#ranking)), com posição, nome, categoria, nota, nº de avaliações.
- Filtros: categoria, "tem narga", só onde já fui / ainda não fui.
- Ordenações: melhor nota, mais avaliado, mais recente, pior nota ("ranking reverso").
- Tocar num item abre a ficha.

### Mapa

- Todos os lugares ativos, pino colorido por categoria, agrupamento (cluster) quando dá zoom out.
- Tocar no pino abre um card resumido (nome, nota, categoria) com botão pra ficha e pra abrir no Maps.
- Botão "onde estou" (geolocalização do navegador) e visão inicial centrada no Centro.
- Mesmo filtro de categoria do ranking.

### Status por lugar (público)

- "Quero ir" e "Já fui" com um toque. Avaliar marca "Já fui" automaticamente.
- **Tudo visível pro grupo inteiro**: na ficha aparecem os nomes de quem já foi e de quem quer ir, e a aba Rolê mostra as listas de todo mundo (com filtro "só eu"). Nada no app é privado além da senha.

### Contas e admin

- Login com email + senha. Sem cadastro aberto, sem "esqueci a senha" por email.
- O login tem um **reCAPTCHA falso** temático ("Selecione todas as imagens com narguilé"). Só zoeira: não valida nada. Spec no [09](./09-captcha-de-zoeira.md).
- Admin cria usuários (nome, email, senha temporária), reseta senha, desativa, promove a admin.
- Usuário troca a própria senha e o próprio nome. Na primeira entrada com senha temporária, o app obriga a trocar.

### PWA

- Instalável no Android e iOS, ícone e splash com o cachorro.
- Abre offline mostrando o último ranking carregado, ou uma página "sem internet" com piada.

## Funcionalidades — v2 (depois que o MVP estiver em uso)

- **Fotos**: upload na avaliação e na ficha do lugar (redimensionadas, sem EXIF).
- **Sortear rolê**: "roleta" que escolhe um lugar aleatório entre os filtros (categoria, quero ir, tem narga). Resolve a discussão de "onde vamos hoje".
- **Feed**: "Fulano deu 4,5 nargas pro Sebo X", "Ciclana adicionou Y" — virou também o lugar dos **posts** (seção abaixo).
- **Placar de pessoas**: quem mais avaliou, crítico mais rigoroso (menor média), quem mais adicionou.
- **Respostas** em avaliações (thread curta).
- **Tags livres** além da categoria ("aceita pix", "bom e barato", "fecha cedo").
- **Exportar/importar**: backup em JSON; importar lista salva do Google Maps (o Takeout gera CSV com nome + link, e o parser de link já vai existir).
- **Link público somente leitura** de um lugar ou do ranking, pra mandar pra alguém de fora.
- **Modo "estou aqui"**: lista lugares num raio de 300 m e botão "avaliar agora".

## Feed

O `/feed` é a linha do tempo do grupo. Duas coisas convivem lá:

- **Novidades** (automáticas): avaliação nova, lugar novo, "quero ir"/"já fui", reação e "chamar galera". Avaliação aparece como **card** (nota em nargas, veredito e prévia do texto, com link pra ficha); o resto continua sendo uma linha curta.
- **Posts** (escritos à mão, botão "📸 Postar"): **foto ou vídeo, e/ou texto** (pelo menos um) e **sempre com quem postou e de onde**.

Regras do post:

- "De onde" é obrigatório e vem de um dos três jeitos: **onde estou** (GPS + endereço por reverse geocoding; se tiver um lugar cadastrado a menos de 150 m, o app pergunta "Você tá no Sebo do João?"), **escolher lugar** (lista com busca, ordenada por distância quando tem GPS) ou **marcar no mapa** (o mesmo pino do cadastro de lugar).
- Com lugar escolhido, a coordenada e o endereço são os do lugar; sem lugar, ficam a coordenada do GPS/mapa e o endereço do reverse geocoding (ou só a coordenada, se ele não responder).
- Texto puro, até 1000 caracteres, com quebras de linha. Foto reprocessada pelo sharp (webp, sem EXIF), igual às fotos de lugar.
- **Vídeo** (gravado na hora ou da galeria): MP4/MOV ou WebM, até 60 MB, guardado como veio (sem transcodificar; o celular já grava H.264). O card mostra o player com a proporção certa e altura limitada; vídeo de iPhone em HEVC pode não tocar em Android, e aí é regravar em "mais compatível".
- Post **fica pra sempre** na timeline. Quem apaga é quem postou (ou admin), e a imagem some junto.
- Limite de 20 posts por hora por pessoa ("Calma, influencer."). Não é moderação: é pra ninguém entupir o feed sem querer.
- Dá pra **reagir** (os mesmos emojis das avaliações) e **comentar** (thread curta, texto puro, até 500 caracteres) em qualquer post. Comentário some pela mão de quem escreveu, de quem postou ou do admin. Reação em post também vira linha nas novidades ("Fulano reagiu 😂 no post de Ciclano em X"); comentário não, fica só no card.
- **Importar do Instagram**: cola o link de um post ou reel e o app traz a **primeira mídia** (foto ou vídeo; de carrossel, o primeiro slide) e a **legenda** pra revisar antes de publicar. Reel vem com o vídeo e a capa; vídeo acima de 60 MB e post privado são recusados, e sobra o caminho manual. O post guarda a origem ("📸 @perfil no Instagram", com link). Pelo **Compartilhar** do Instagram (Android com o app instalado) o link chega direto no formulário e a importação começa sozinha.
- Comentário no post de outra pessoa manda um **push** só pra quem postou ("Fulano comentou no seu post: “…”"), que abre o feed já no post. Comentar no próprio post não apita, e quem não ligou as notificações simplesmente não recebe.

## Não-objetivos (de propósito)

- Cadastro público, recuperação de senha por email, login social.
- Moderação, denúncias, reputação.
- Horário de funcionamento e cardápio (manutenção chata, desatualiza rápido). O campo livre "dicas" cobre.
- Escrita offline (avaliar sem internet e sincronizar depois). Complexidade alta pra pouco ganho: o Centro tem 4G.
- Notificações push. O grupo do WhatsApp já cumpre esse papel.
- Multi-idioma. Tudo em pt-BR.

## Sugestões extras (zoeira aplicada)

Coisas baratas de fazer que dão personalidade. As marcadas com ✓ foram aprovadas em 02/09/2026 e estão no roadmap; as outras ficam como opção.

| Ideia                                                                                      | Custo | Onde               |
| ------------------------------------------------------------------------------------------ | ----- | ------------------ |
| ✓ reCAPTCHA falso no login, com desafios de narguilé (ver [09](./09-captcha-de-zoeira.md)) | médio | login              |
| ✓ Selo "Aprovado pelo narga" pra lugar com média ≥ 4,5 e ≥ 3 avaliações                    | baixo | ficha e ranking    |
| ✓ Reações com emoji nas avaliações                                                         | baixo | ficha              |
| ✓ Estados vazios com o cachorro: "Nenhum lugar ainda. E o narga?"                          | baixo | todas as telas     |
| ✓ Página offline: "Sem internet. E o narga? Fica pra depois."                              | baixo | PWA                |
| Nota em "nargas" com o rosto do cachorro no lugar da estrela                               | baixo | componente de nota |
| Filtro "Tem narga?" em destaque, com ranking próprio "Melhores nargas do Centro"           | baixo | ranking            |
| Toggle de tema claro com o texto "Modo claro? E o narga?"                                  | baixo | perfil             |
| Easter egg: 5 toques no logo mostram o meme em tela cheia                                  | baixo | header             |
| "Lugar do mês": o mais avaliado nos últimos 30 dias                                        | médio | home               |
| Atalho do ícone (long-press no Android): "Adicionar lugar" e "Mapa"                        | baixo | manifest           |

## Glossário

- **Narga**: narguilé.
- **Rolê**: saída do grupo.
- **Lugar**: qualquer estabelecimento ou ponto cadastrado.
- **Ficha**: página de detalhe de um lugar.
- **Veredito**: a frase curta obrigatória de cada avaliação.
