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

/**
 * Badge das notificações (docs/06). O Android pinta só o alfa do badge, então tem que ser
 * silhueta branca sobre transparente: a foto do cachorro virava um quadrado. Um narguilé,
 * óbvio. Grade de 96 pra bater com o tamanho servido (24 dp em xxxhdpi).
 */
const BADGE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">
  <g fill="#fff">
    <rect x="36" y="6" width="24" height="15" rx="4"/>
    <rect x="43" y="20" width="10" height="44"/>
    <ellipse cx="48" cy="35" rx="21" ry="5.5"/>
    <path d="M36 58C46 51 50 51 60 58C74 68 73 84 62 90H34C23 84 22 68 36 58Z"/>
  </g>
  <path d="M58 27C82 30 84 56 72 66C65 72 59 75 57 80" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="round"/>
</svg>`;

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

  // Badge das notificações: renderiza o SVG a 4× e reduz, pra borda lisa.
  await sharp(Buffer.from(BADGE_SVG), { density: 288 })
    .resize(96, 96)
    .png()
    .toFile(path.join(OUT, "badge-96.png"));

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
