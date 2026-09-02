import fs from "node:fs";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

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
  await login(page);

  // Ranking vazio
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Nenhum lugar ainda. E o narga?")).toBeVisible();
  await shot(page, "05-ranking-vazio");

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

  // Ficha
  await page.waitForURL(/\/lugares\/sebo-do-joao$/);
  await expect(page.getByRole("heading", { name: /Sebo do João/ })).toBeVisible();
  await expect(page.getByText("Ninguém deu nota", { exact: false })).toBeVisible();
  await expect(page.locator("a", { hasText: /Abrir no Maps/i })).toHaveAttribute(
    "href",
    /google\.com\/maps\/search\/\?api=1&query=-27\.\d+,-48\.\d+/,
  );
  await expect(page.locator("a", { hasText: /Como chegar/i })).toHaveAttribute("href", /maps\/dir/);
  await shot(page, "08-ficha");

  // Quero ir
  await page.getByRole("button", { name: /Quero ir/ }).click();
  await expect(page.getByText(/Querem ir:.*Admin/)).toBeVisible();
  await shot(page, "09-ficha-quero-ir");

  // Rolê mostra o grupo inteiro
  await page.goto("/role");
  await expect(page.getByRole("link", { name: /Sebo do João/ })).toBeVisible();
  await expect(page.getByText(/Admin quer ir/)).toBeVisible();
  await shot(page, "10-role");

  // Ranking: entra em "Ainda sem nota"
  await page.goto("/");
  await expect(page.getByText(/Ainda sem nota/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Sebo do João/ })).toBeVisible();
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
  await page.getByRole("button", { name: "Sair" }).click();
  await page.waitForURL(/\/login/);
});

test("página de termos é pública e tem a piada", async ({ page }) => {
  await page.goto("/termos");
  await expect(page.getByText("Não tem termos. E o narga?")).toBeVisible();
});
