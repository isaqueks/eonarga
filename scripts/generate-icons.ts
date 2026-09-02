/**
 * Gera favicon, ícones do PWA e logos a partir do eonarga.jpg.
 * Uso: npm run icons
 *
 * O original é 554×554, JPEG, com o texto "e o narga?" na faixa inferior.
 * Ícones pequenos usam um recorte do rosto (o texto vira ruído em 16 px);
 * ícones grandes usam a imagem inteira.
 */
import fs from "node:fs/promises";
import path from "node:path";
import pngToIco from "png-to-ico";
import sharp from "sharp";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "eonarga.jpg");
const OUT = path.join(ROOT, "public", "icons");
const APP = path.join(ROOT, "src", "app");
const BG = "#0e1110";

// Recorte do rosto: tira a faixa do texto e um pouco das bordas. Ajustar olhando.
const FACE = { left: 47, top: 20, width: 460, height: 460 };

async function main() {
  const meta = await sharp(SRC).metadata();
  if (!meta.width || !meta.height) throw new Error("não consegui ler eonarga.jpg");
  console.log(`fonte: ${meta.width}×${meta.height} ${meta.format}`);

  await fs.mkdir(OUT, { recursive: true });

  const full = () => sharp(SRC);
  const face = () => sharp(SRC).extract(FACE);

  // Logo inteiro (login, estados vazios) e recorte do rosto (header).
  await fs.copyFile(SRC, path.join(ROOT, "public", "logo.jpg"));
  await face().resize(256, 256).png().toFile(path.join(OUT, "logo-face.png"));

  // PWA
  await full().resize(192, 192).png().toFile(path.join(OUT, "icon-192.png"));
  await full().resize(512, 512).png().toFile(path.join(OUT, "icon-512.png"));

  // Maskable: imagem a 80% sobre fundo, pra ficar dentro da zona segura.
  const inner = Math.round(512 * 0.8);
  const innerBuf = await full().resize(inner, inner).png().toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 4, background: BG },
  })
    .composite([{ input: innerBuf, gravity: "centre" }])
    .png()
    .toFile(path.join(OUT, "icon-maskable-512.png"));

  // Apple touch icon (iOS arredonda sozinho)
  await full().resize(180, 180).png().toFile(path.join(OUT, "apple-touch-icon.png"));
  await full().resize(180, 180).png().toFile(path.join(APP, "apple-icon.png"));

  // Favicons: recorte do rosto
  const favSizes = [16, 32, 48];
  const favBufs: Buffer[] = [];
  for (const s of favSizes) {
    const buf = await face().resize(s, s).png().toBuffer();
    favBufs.push(buf);
    await fs.writeFile(path.join(OUT, `favicon-${s}.png`), buf);
  }
  await fs.writeFile(path.join(APP, "favicon.ico"), await pngToIco(favBufs));
  await face().resize(192, 192).png().toFile(path.join(APP, "icon.png"));

  const files = await fs.readdir(OUT);
  console.log(`gerados em public/icons: ${files.join(", ")}`);
  console.log("gerados em src/app: favicon.ico, icon.png, apple-icon.png");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
