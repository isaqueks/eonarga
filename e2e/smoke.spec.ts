import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";

import { E2E_ADMIN } from "./fixtures";

// Screenshots vão pra fora do repo quando SHOTS_DIR estiver definido; senão pra test-results/shots.
const SHOTS = process.env.SHOTS_DIR ?? path.resolve("test-results/shots");
fs.mkdirSync(SHOTS, { recursive: true });

async function shot(page: Page, name: string) {
  await page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
}

/** Passa pelo reNARGA: marca dois tiles e clica VERIFICAR até o popup sumir. */
async function solveCaptcha(page: Page) {
  // O input nativo fica atrás da caixinha desenhada; gente clica no rótulo.
  const label = page.getByText("Não sou um robô");
  await expect(label).toBeVisible();
  await label.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible({ timeout: 10_000 });
  await shot(page, "02-captcha-desafio");

  for (let round = 0; round < 4; round++) {
    const tiles = dialog
      .getByRole("button", { pressed: false })
      .filter({ has: page.locator("img") });
    const count = await tiles.count();
    for (let i = 0; i < Math.min(2, count); i++) {
      await tiles.nth(0).click();
    }
    if (round === 0) await shot(page, "03-captcha-selecionado");
    await dialog.getByRole("button", { name: /verificar|pular/i }).click();
    try {
      await expect(dialog).toBeHidden({ timeout: 4_000 });
      break;
    } catch {
      // "Selecione também as imagens restantes": mais uma rodada.
    }
  }
  await expect(dialog).toBeHidden();
}

async function login(page: Page) {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "E o narga?" })).toBeVisible();
  await shot(page, "01-login");

  await page.locator("#email").fill(E2E_ADMIN.email);
  await page.locator("#password").fill(E2E_ADMIN.password);

  const entrar = page.getByRole("button", { name: "Entrar" });
  await expect(entrar).toBeDisabled();
  await solveCaptcha(page);
  await expect(entrar).toBeEnabled();
  await shot(page, "04-captcha-ok");

  await entrar.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

test.describe.configure({ mode: "serial" });

test("rotas protegidas mandam pro login", async ({ page }) => {
  await page.goto("/mapa");
  await expect(page).toHaveURL(/\/login\?next=%2Fmapa/);
  const res = await page.request.get("/api/geocode?q=mercado");
  expect(res.status()).toBe(401);
});

test("login com captcha, cadastro de lugar, status, rolê, mapa e admin", async ({ page }) => {
  // Qualquer bloqueio da CSP (next.config.ts) aparece no console: a corrida inteira
  // precisa terminar sem nenhum.
  const cspErrors: string[] = [];
  page.on("console", (message) => {
    if (/Content Security Policy|Refused to/i.test(message.text())) cspErrors.push(message.text());
  });

  await login(page);

  // Ranking vazio
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Nenhum lugar ainda. E o narga?")).toBeVisible();
  await shot(page, "05-ranking-vazio");

  // Celular sem o app instalado: "Instalar aplicativo" fica fixo; sem prompt nativo
  // (headless não manda beforeinstallprompt) abre as instruções.
  const instalar = page.getByRole("button", { name: "Instalar aplicativo" });
  await expect(instalar).toBeVisible();
  await instalar.click();
  await expect(page.getByRole("dialog")).toContainText("Instalar o E o narga?");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Novo lugar: marcar no mapa
  // Botões que viram <Link> ganham role="button" no Base UI; seleciona pelo texto.
  await page.getByText("Adicionar o primeiro").click();
  await expect(page).toHaveURL(/\/lugares\/novo/);
  await page.getByRole("button", { name: "Abrir o mapa" }).click();

  // O rótulo fica no próprio container do Leaflet.
  const picker = page.getByLabel("Escolher a posição no mapa");
  await expect(picker).toBeVisible();
  await expect(picker).toHaveClass(/leaflet-container/);
  const continuar = page.getByRole("button", { name: "Continuar" });
  // O pino nasce no centro e marcadores não repassam o clique pro mapa: clica longe dele.
  // (clique pelo locator: rola a seção pra dentro da viewport antes de clicar)
  for (let attempt = 0; attempt < 4; attempt++) {
    const box = await picker.boundingBox();
    if (!box) throw new Error("picker sem bounding box");
    await picker.click({
      position: { x: box.width / 2 + 80 + 15 * attempt, y: box.height / 2 + 60 - 15 * attempt },
    });
    try {
      await expect(continuar).toBeEnabled({ timeout: 3_000 });
      break;
    } catch {
      // ainda não pegou: repete
    }
  }
  await expect(picker.locator(".leaflet-marker-icon")).toHaveCount(1);
  await shot(page, "06-novo-onde");
  await expect(continuar).toBeEnabled();
  await continuar.click();

  // Passo 2: o quê
  await page.locator('input[name="name"]').fill("Sebo do João");
  await page
    .getByRole("radiogroup", { name: "Categoria" })
    .getByRole("radio", { name: /sebo/i })
    .click();
  await page
    .getByRole("radiogroup", { name: "Tem narga?" })
    .getByRole("radio", { name: /^Tem/ })
    .click();
  await page.getByRole("radiogroup", { name: "Faixa de preço" }).getByRole("radio").nth(0).click();
  await page
    .locator('textarea[name="description"], input[name="description"]')
    .first()
    .fill("Livro usado e cheiro de mofo bom.");
  await page
    .locator('textarea[name="tips"], input[name="tips"]')
    .first()
    .fill("Caixa dos R$5 perto da porta");
  await page.locator('input[name="instagram"]').fill("@sebodojoao");
  await shot(page, "07-novo-oque");
  await page.getByRole("button", { name: "Salvar lugar" }).click();

  // Passo 3: sua nota (a criação redireciona pra /avaliar?novo=1)
  await page.waitForURL(/\/lugares\/sebo-do-joao\/avaliar\?novo=1$/);
  await expect(page.getByText("3 de 3")).toBeVisible();
  const slider = page.getByRole("slider");
  await slider.focus();
  await page.keyboard.press("End");
  await expect(slider).toHaveAttribute("aria-valuetext", /5,0 de 5/);
  await page.locator('input[name="verdict"]').fill("Melhor sebo do Centro, sem discussão");
  await page.locator(".ProseMirror").click();
  await page.keyboard.type("Achei um Bukowski por cinco reais. ");
  await page.getByRole("button", { name: "Publicar" }).click();

  // Ficha com a nota
  await page.waitForURL(/\/lugares\/sebo-do-joao(#avaliacoes)?$/);
  await expect(page.getByRole("heading", { name: /Sebo do João/ })).toBeVisible();
  await expect(page.locator("#avaliacoes")).toContainText("Melhor sebo do Centro");
  await expect(page.locator("#avaliacoes")).toContainText("Bukowski");
  await expect(page.getByText("5,0").first()).toBeVisible();
  await expect(page.getByText(/Já foram:/)).toBeVisible();
  await shot(page, "08b-ficha-com-nota");
  await expect(page.locator("a", { hasText: /Abrir no Maps/i })).toHaveAttribute(
    "href",
    /google\.com\/maps\/search\/\?api=1&query=-27\.\d+,-48\.\d+/,
  );
  await expect(page.locator("a", { hasText: /Como chegar/i })).toHaveAttribute("href", /maps\/dir/);
  await shot(page, "08-ficha");

  // Fui de novo: cada visita rende uma avaliação nova (docs/08 #29).
  await page.getByText("Fui de novo? Dá outra nota").click();
  await page.waitForURL(/\/lugares\/sebo-do-joao\/avaliar$/);
  await expect(page.getByText(/Você já deu nota aqui 1 vez/)).toBeVisible();
  const sliderDeNovo = page.getByRole("slider");
  await sliderDeNovo.focus();
  await page.keyboard.press("Home");
  await page.keyboard.press("PageUp");
  await page.keyboard.press("PageUp");
  await expect(sliderDeNovo).toHaveAttribute("aria-valuetext", /3,0 de 5/);
  await page.locator('input[name="verdict"]').fill("Voltei e tava meia boca");
  await page.getByRole("button", { name: "Publicar" }).click();

  // Ficha: as duas contam na contagem e na média ((5,0 + 3,0) / 2 = 4,0).
  await page.waitForURL(/\/lugares\/sebo-do-joao(#avaliacoes)?$/);
  await expect(page.getByRole("heading", { name: "Avaliações (2)" })).toBeVisible();
  await expect(page.getByText("Voltei e tava meia boca")).toBeVisible();
  await expect(page.getByText("você já avaliou 2 vezes")).toBeVisible();
  await expect(page.getByText("4,0").first()).toBeVisible();
  await shot(page, "08c-ficha-duas-notas");

  // Quero ir
  await page.getByRole("button", { name: /Quero ir/ }).click();
  await expect(page.getByText(/Querem ir:.*Admin/)).toBeVisible();
  await shot(page, "09-ficha-quero-ir");

  // Rolê mostra o grupo inteiro
  await page.goto("/role");
  await expect(page.getByRole("link", { name: /Sebo do João/ })).toBeVisible();
  await expect(page.getByText(/Admin quer ir/)).toBeVisible();
  await shot(page, "10-role");

  // Ranking: primeiro lugar, com o veredito mais recente como citação
  await page.goto("/");
  await expect(page.getByRole("link", { name: /Sebo do João/ })).toBeVisible();
  await expect(page.getByText("Voltei e tava meia boca")).toBeVisible();
  await expect(page.getByText("poucas notas").first()).toBeVisible();
  await page.goto("/?cat=restaurante");
  await expect(page.getByRole("link", { name: /Sebo do João/ })).toHaveCount(0);
  await shot(page, "11-ranking-filtro");

  // Mapa com o pino
  await page.goto("/mapa");
  const map = page.getByLabel("Mapa dos lugares");
  await expect(map).toHaveClass(/leaflet-container/);
  // Um pino de lugar; o pontinho "estou aqui" (geolocalização do contexto de teste) é outro marcador.
  await expect(map.locator(".narga-pin")).toHaveCount(1);
  await expect(map.locator(".narga-here")).toHaveCount(1);
  await map.locator(".narga-pin").first().click();
  await expect(page.locator("a", { hasText: /Ver ficha/i })).toBeVisible();
  await shot(page, "12-mapa");

  // Editar: membro pode mudar "tem narga" e dicas
  await page.goto("/lugares/sebo-do-joao/editar");
  await page
    .getByRole("radiogroup", { name: "Tem narga?" })
    .getByRole("radio", { name: /não sei/i })
    .click();
  await page.getByRole("button", { name: /Salvar/ }).click();
  await page.waitForURL(/\/lugares\/sebo-do-joao$/);
  await expect(page.getByText(/Não sei/i).first()).toBeVisible();

  // Admin: categorias e usuários
  await page.goto("/admin/categorias");
  await expect(page.getByRole("cell", { name: "Sebo", exact: true })).toBeVisible();
  await shot(page, "13-admin-categorias");
  await page.goto("/admin/usuarios");
  await page.getByRole("button", { name: /Novo usuário/i }).click();
  await page.getByLabel(/Nome/).fill("Ana Teste");
  await page.getByLabel(/Email/).fill("ana@eonarga.local");
  await page.getByRole("dialog").getByRole("button", { name: /Criar/i }).click();
  // Em dev a action compila na primeira chamada; dá mais folga que o padrão.
  await expect(page.getByText(/senha tempor/i).first()).toBeVisible({ timeout: 60_000 });
  await expect(page.locator("code").filter({ hasText: /\w+-\w+-\w+-\d+/ })).toBeVisible();
  await shot(page, "14-admin-usuario-criado");

  // Galera: todo mundo vê todo mundo
  await page.goto("/galera");
  await expect(page.getByRole("heading", { name: "Galera" })).toBeVisible();
  await expect(page.getByText("Admin", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Ana Teste")).toBeVisible();
  await shot(page, "14b-galera");

  // Foto de perfil: envia um PNG gerado na hora
  await page.goto("/perfil");
  const png = await sharp({
    create: { width: 96, height: 96, channels: 3, background: "#f4b942" },
  })
    .png()
    .toBuffer();
  await page.waitForLoadState("networkidle");
  const avatarImg = page.locator('img[alt="Admin"]').first();
  for (let attempt = 0; attempt < 3; attempt++) {
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: png });
    try {
      await expect(avatarImg).toHaveAttribute("src", /\/api\/uploads\/[A-Za-z0-9_-]+/, {
        timeout: 20_000,
      });
      break;
    } catch {
      // hidratação ainda não tinha ligado o input: repete
    }
  }
  await expect(avatarImg).toHaveAttribute("src", /\/api\/uploads\/[A-Za-z0-9_-]+/);
  // "Minhas avaliações" lista as duas visitas do mesmo lugar, cada uma com link pra ficha.
  await expect(page.getByText("Minhas avaliações")).toBeVisible();
  await expect(page.getByRole("link", { name: /Sebo do João/ })).toHaveCount(2);

  // Foto do lugar: manda pela ficha e confere a thumb na grade.
  await page.goto("/lugares/sebo-do-joao");
  await expect(page.getByRole("heading", { name: /^Fotos \(0\)$/ })).toBeVisible();
  await expect(page.getByText("Sem fotos. Alguém tira uma?")).toBeVisible();
  const fotoLugar = await sharp({
    create: { width: 240, height: 180, channels: 3, background: "#3a7d5c" },
  })
    .png()
    .toBuffer();
  // O input escondido só dispara o envio depois da hidratação; se o primeiro `change`
  // cair antes disso, tenta de novo.
  await page.waitForLoadState("networkidle");
  const fotosUm = page.getByRole("heading", { name: /^Fotos \(1\)$/ });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page
      .locator('input[type="file"][name="photo"]')
      .setInputFiles({ name: "lugar.png", mimeType: "image/png", buffer: fotoLugar });
    try {
      await expect(fotosUm).toBeVisible({ timeout: 20_000 });
      break;
    } catch {
      // ainda não pegou: repete
    }
  }
  await expect(fotosUm).toBeVisible();
  const thumb = page.locator('img[alt="Foto de Admin"]').first();
  await expect(thumb).toHaveAttribute("src", /\/api\/uploads\/[A-Za-z0-9_-]+\?v=thumb/);
  await shot(page, "14c-ficha-fotos");

  // Perfil e sair
  await page.goto("/perfil");
  // O email pode estar num input somente leitura ou em texto.
  await expect(
    page.locator(`input[value="${E2E_ADMIN.email}"], :text("${E2E_ADMIN.email}")`).first(),
  ).toBeVisible();
  // Admin: gênero em texto livre e testosterona sem teto.
  await page.locator("#gender").fill("Alfa de Floripa");
  await page.locator("#testosterone").fill("5000");
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Salvo.")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.locator("#gender")).toHaveValue("Alfa de Floripa");
  await expect(page.locator("#testosterone")).toHaveValue("5000");
  await shot(page, "15-perfil");

  // Tema: o toggle tira e devolve a classe `dark` do <html> (next-themes).
  const html = page.locator("html");
  await expect(html).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Modo claro? E o narga?" }).click();
  await expect(html).not.toHaveClass(/dark/);
  await shot(page, "16-tema-claro");
  await page.getByRole("button", { name: "Voltar pro escuro" }).click();
  await expect(html).toHaveClass(/dark/);

  // 404 global (URL que não casa com rota nenhuma).
  await page.goto("/isso-nao-existe-mesmo");
  await expect(page.getByText("Esse lugar não existe.")).toBeVisible();
  await shot(page, "17-404");

  await page.goto("/perfil");
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL(/\/login/);

  expect(cspErrors, "a CSP bloqueou alguma coisa durante o fluxo").toEqual([]);
});

test("link público do lugar abre pra quem não tem conta", async ({ page, browser }) => {
  await login(page);
  await page.goto("/lugares/sebo-do-joao");

  // O menu só responde depois da hidratação; repete o clique até ele abrir.
  const copiar = page.getByRole("menuitem", { name: /Copiar link público/ });
  for (let attempt = 0; attempt < 6; attempt++) {
    await page.getByRole("button", { name: "Mais ações" }).click();
    try {
      await expect(copiar).toBeVisible({ timeout: 2_000 });
      break;
    } catch {
      await page.keyboard.press("Escape");
    }
  }
  await expect(copiar).toBeVisible();
  // O href do menu: o botão copia isso pra área de transferência.
  const shareUrl = await copiar.getAttribute("data-share-url");
  expect(shareUrl).toBeTruthy();
  await copiar.click();
  await expect(page.getByText("Copiado!")).toBeVisible();

  // O APP_URL do servidor pode apontar pra outra porta; o que importa é o caminho + token.
  const origin = new URL(page.url()).origin;
  const parsed = new URL(shareUrl!, origin);
  const publicUrl = `${origin}${parsed.pathname}${parsed.search}`;

  // Contexto novo = sem cookie de sessão: é o amigo de fora abrindo o link.
  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  const response = await anonPage.goto(publicUrl);
  expect(response?.status()).toBe(200);
  await expect(anonPage.getByRole("heading", { name: /Sebo do João/ })).toBeVisible();
  await expect(anonPage.getByText(/o app é fechado, mas esse lugar é público/)).toBeVisible();
  await expect(anonPage.getByText("Melhor sebo do Centro, sem discussão")).toBeVisible();
  // Só o primeiro nome de quem avaliou, e nada de status de ninguém.
  await expect(anonPage.getByText(/Já foram:/)).toHaveCount(0);
  await shot(anonPage, "18-link-publico");

  // Sem token não tem página.
  const semToken = await anonPage.goto(`${origin}/p/sebo-do-joao`);
  expect(semToken?.status()).toBe(404);

  await anon.close();
});

/**
 * O "Onde" começa tentando o GPS (o contexto de teste responde a Praça XV). Se ele
 * resolveu antes da gente, a tela já mostra o resumo: aí é o "Trocar" que reabre as
 * três opções.
 */
async function abrirOnde(page: Page) {
  const escolher = page.getByRole("button", { name: "Escolher lugar" });
  const trocar = page.getByRole("button", { name: "Trocar" });

  for (let attempt = 0; attempt < 10; attempt++) {
    if (await escolher.isVisible().catch(() => false)) return;
    if (await trocar.isVisible().catch(() => false)) {
      await trocar.click();
      continue;
    }
    // Ainda hidratando, ou o GPS ainda pensando.
    await page.waitForTimeout(500);
  }
  await expect(escolher).toBeVisible();
}

test("postar no feed: lugar, foto no mapa e apagar", async ({ page }) => {
  // O "Apagar" pede confirmação nativa.
  page.on("dialog", (dialog) => void dialog.accept());
  await login(page);

  // A avaliação do fluxo anterior aparece no feed como card, não como linha solta.
  await page.goto("/feed");
  await expect(page.getByRole("heading", { name: "Novidades" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Instalar aplicativo" })).toBeVisible();
  const cardDaNota = page.locator("article").filter({ hasText: "Melhor sebo do Centro" });
  await expect(cardDaNota).toContainText("Achei um Bukowski");
  await expect(cardDaNota.getByRole("link", { name: /Sebo do João/ })).toHaveAttribute(
    "href",
    "/lugares/sebo-do-joao",
  );
  await shot(page, "19-feed-avaliacao");

  // --- Post 1: lugar da lista + texto ---------------------------------------
  await page.getByText("📸 Postar").click();
  await expect(page).toHaveURL(/\/feed\/novo$/);

  await abrirOnde(page);
  await page.getByRole("button", { name: "Escolher lugar" }).click();
  await page.getByRole("button", { name: /Sebo do João/ }).click();
  await expect(page.getByRole("button", { name: "Trocar" })).toBeVisible();

  await page.getByLabel("Texto do post").fill("Tô aqui e tem narga");
  await shot(page, "20-postar-lugar");
  const publicar = page.getByRole("button", { name: "Publicar" });
  await expect(publicar).toBeEnabled();
  await publicar.click();

  await page.waitForURL(/\/feed$/);
  const cardTexto = page.locator("article").filter({ hasText: "Tô aqui e tem narga" });
  await expect(cardTexto).toBeVisible({ timeout: 30_000 });
  await expect(cardTexto.getByRole("link", { name: /Sebo do João/ })).toBeVisible();

  // --- Post 2: só foto, com a posição marcada no mapa -----------------------
  await page.getByText("📸 Postar").click();
  await expect(page).toHaveURL(/\/feed\/novo$/);

  const fotoPost = await sharp({
    create: { width: 200, height: 150, channels: 3, background: "#8fd3b0" },
  })
    .png()
    .toBuffer();

  // O input só reage depois da hidratação; se o primeiro `change` cair antes, repete.
  const tirar = page.getByRole("button", { name: "Tirar" });
  for (let attempt = 0; attempt < 3; attempt++) {
    await page
      .locator('input[name="photo"]')
      .setInputFiles({ name: "post.png", mimeType: "image/png", buffer: fotoPost });
    try {
      await expect(tirar).toBeVisible({ timeout: 5_000 });
      break;
    } catch {
      // ainda não pegou: repete
    }
  }
  await expect(tirar).toBeVisible();

  await abrirOnde(page);
  await page.getByRole("button", { name: "Marcar no mapa" }).click();
  const picker = page.getByLabel("Escolher a posição no mapa");
  await expect(picker).toBeVisible();
  const publicar2 = page.getByRole("button", { name: "Publicar" });
  // O pino nasce no centro e não repassa o clique pro mapa: clica longe dele.
  for (let attempt = 0; attempt < 4; attempt++) {
    const box = await picker.boundingBox();
    if (!box) throw new Error("picker sem bounding box");
    await picker.click({
      position: { x: box.width / 2 + 70 + 15 * attempt, y: box.height / 2 + 50 - 15 * attempt },
    });
    try {
      await expect(publicar2).toBeEnabled({ timeout: 3_000 });
      break;
    } catch {
      // ainda não pegou: repete
    }
  }
  await expect(publicar2).toBeEnabled();
  await shot(page, "21-postar-foto");
  await publicar2.click();

  await page.waitForURL(/\/feed$/);
  const foto = page.getByRole("img", { name: "Foto de Admin" }).first();
  await expect(foto).toBeVisible({ timeout: 30_000 });
  await expect(foto).toHaveAttribute("src", /\/api\/uploads\/[A-Za-z0-9_-]+/);

  const cardFoto = page.locator("article").filter({ has: foto });
  // Sem lugar cadastrado, a linha "de onde" leva pro Maps por coordenada.
  await expect(cardFoto.locator('a[href^="https://www.google.com/maps/search/"]')).toBeVisible();
  await shot(page, "22-feed-com-posts");

  // --- Apagar o post da foto pelo menu "⋯" ----------------------------------
  const apagar = page.getByRole("menuitem", { name: /Apagar/ });
  for (let attempt = 0; attempt < 6; attempt++) {
    await cardFoto.getByRole("button", { name: "Mais ações do post" }).click();
    try {
      await expect(apagar).toBeVisible({ timeout: 2_000 });
      break;
    } catch {
      await page.keyboard.press("Escape");
    }
  }
  await apagar.click();

  await expect(page.getByRole("img", { name: "Foto de Admin" })).toHaveCount(0, {
    timeout: 30_000,
  });
  // O post de texto continua lá.
  await expect(page.getByText("Tô aqui e tem narga")).toBeVisible();
});

test("página offline é pública e tem a copy do cachorro", async ({ page }) => {
  await page.goto("/~offline");
  await expect(page.getByRole("heading", { name: "Sem internet." })).toBeVisible();
  await expect(page.getByText("E o narga? Fica pra depois.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Tentar de novo" })).toBeVisible();
});

test("página de termos é pública e tem a piada", async ({ page }) => {
  await page.goto("/termos");
  await expect(page.getByText("Não tem termos. E o narga?")).toBeVisible();
});
