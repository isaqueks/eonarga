/**
 * Gera as variações do cachorro pro desafio 5 do captcha ("Selecione todas as
 * imagens com o narga") a partir do eonarga.jpg.
 *
 * Uso: npx tsx scripts/generate-captcha-dog.ts
 * (não tem script no package.json de propósito; roda uma vez e commita o webp)
 *
 * O original é 554×554 com a faixa de texto "e o narga?" embaixo. Todo recorte
 * corta essa faixa: no tile de 90 px o texto vira ruído e entrega a piada cedo.
 * Saída: 6 arquivos 200×200 webp em public/captcha/dog.
 */
import fs from "node:fs/promises";
import path from "node:path";

import sharp, { type FitEnum, type Sharp } from "sharp";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "eonarga.jpg");
const OUT = path.join(ROOT, "public", "captcha", "dog");
const SIZE = 200;

// Rosto inteiro, sem a faixa do texto (que começa por volta de y=460).
const FACE = { left: 58, top: 14, width: 440, height: 440 };
// Só os olhos: faixa larga do terço de cima. Vai pro quadrado esticada
// (fit "fill"), senão o "cover" corta as laterais e come os dois olhos.
const EYES = { left: 92, top: 96, width: 372, height: 150 };

const face = () => sharp(SRC).extract(FACE);

async function main() {
  const meta = await sharp(SRC).metadata();
  if (!meta.width || !meta.height) throw new Error("não consegui ler eonarga.jpg");
  console.log(`fonte: ${meta.width}×${meta.height} ${meta.format}`);

  await fs.mkdir(OUT, { recursive: true });

  const write = (name: string, pipe: Sharp, fit: keyof FitEnum = "cover") =>
    pipe
      .resize(SIZE, SIZE, { fit })
      .webp({ quality: 82 })
      .toFile(path.join(OUT, `${name}.webp`));

  // 1. Recorte do rosto, sem filtro. É o "original" do desafio.
  await write("narga-rosto", face());
  // 2. Espelhado: a mesma foto, mas quem está com pressa não percebe.
  await write("narga-espelhado", face().flop());
  // 3. Cores invertidas: o negativo do meme.
  await write("narga-negativo", face().negate({ alpha: false }));
  // 4. Tint verde (o verde do app). O .tint() do sharp não pega em cima de
  //    grayscale (1 banda), então volta pra sRGB e mexe nos canais na mão.
  const cinza = await face().grayscale().toColourspace("srgb").png().toBuffer();
  await write("narga-verde", sharp(cinza).linear([0.55, 1.05, 0.6], [20, 10, 20]));
  // 5. Desfocado de leve, tipo foto de câmera de rua do captcha de verdade.
  await write("narga-desfocado", face().blur(3.5));
  // 6. Zoom nos olhos. Sozinho, não dá pra dizer o que é.
  await write("narga-olhos", sharp(SRC).extract(EYES), "fill");

  const files = (await fs.readdir(OUT)).sort();
  console.log(`gerados em public/captcha/dog: ${files.join(", ")}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
