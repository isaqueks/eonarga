import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type Module = typeof import("./comment-media");

let media: Module;
let uploadDir: string;

const FIXTURES = path.resolve("e2e/fixtures");

async function png(width = 300, height = 200): Promise<File> {
  const data = await sharp({ create: { width, height, channels: 3, background: "#f4b942" } })
    .png()
    .toBuffer();
  return new File([new Uint8Array(data)], "foto.png", { type: "image/png" });
}

function webm(): File {
  const data = fs.readFileSync(path.join(FIXTURES, "tiny.webm"));
  return new File([new Uint8Array(data)], "gravacao.webm", { type: "audio/webm;codecs=opus" });
}

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function files(): string[] {
  return fs.existsSync(uploadDir) ? fs.readdirSync(uploadDir).sort() : [];
}

beforeAll(async () => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-comment-media-"));
  // storage.ts lê UPLOAD_DIR no import: tem que estar de pé antes do primeiro import.
  process.env.UPLOAD_DIR = uploadDir;
  media = await import("./comment-media");
});

afterAll(() => {
  try {
    fs.rmSync(uploadDir, { recursive: true, force: true });
  } catch {
    // No Windows o arquivo às vezes segue travado por um instante.
  }
});

describe("hasCommentMedia", () => {
  it("só conta arquivo de verdade", async () => {
    expect(media.hasCommentMedia(form({ body: "oi" }))).toBe(false);
    expect(media.hasCommentMedia(form({ photo: new File([], "vazio.png") }))).toBe(false);
    expect(media.hasCommentMedia(form({ photo: await png() }))).toBe(true);
    expect(media.hasCommentMedia(form({ audio: webm() }))).toBe(true);
  });
});

describe("saveCommentMedia", () => {
  it("sem anexo devolve a mídia vazia sem tocar o disco", async () => {
    expect(await media.saveCommentMedia(form({ body: "só texto" }))).toEqual({
      ok: true,
      media: { photo: null, audio: null },
    });
    expect(files()).toEqual([]);
  });

  it("reprocessa a foto em webp com miniatura, encolhendo pra 1200 px", async () => {
    const result = await media.saveCommentMedia(form({ photo: await png(2400, 1200) }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.media.audio).toBeNull();
    expect(result.media.photo).toMatchObject({ width: 1200, height: 600 });
    const id = result.media.photo!.id;
    expect(files()).toEqual([`${id}.thumb.webp`, `${id}.webp`]);

    expect(media.commentMediaValues(result.media)).toEqual({
      photoId: id,
      photoWidth: 1200,
      photoHeight: 600,
      audioId: null,
      audioExt: null,
      audioDurationMs: null,
      audioPeaks: null,
    });

    await media.deleteCommentMedia({ photoId: id, audioId: null });
    expect(files()).toEqual([]);
  });

  it("guarda o áudio como veio, com duração e forma de onda do navegador", async () => {
    const result = await media.saveCommentMedia(
      form({ audio: webm(), audioDurationMs: "7400", audioPeaks: "[0,0.5,1]" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.media.photo).toBeNull();
    expect(result.media.audio).toMatchObject({ ext: "webm", durationMs: 7400, peaks: [0, 0.5, 1] });
    const id = result.media.audio!.id;
    expect(files()).toEqual([`${id}.webm`]);
    expect(media.commentMediaValues(result.media)).toMatchObject({
      photoId: null,
      audioId: id,
      audioExt: "webm",
      audioDurationMs: 7400,
      audioPeaks: "[0,0.5,1]",
    });

    await media.deleteCommentMedia([{ photoId: null, audioId: id }]);
    expect(files()).toEqual([]);
  });

  it("duração e forma de onda inválidas viram 0 / null, o áudio entra igual", async () => {
    const result = await media.saveCommentMedia(
      form({ audio: webm(), audioDurationMs: "-1", audioPeaks: "[7]" }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.media.audio).toMatchObject({ durationMs: 0, peaks: null });
    await media.deleteCommentMedia({ photoId: null, audioId: result.media.audio!.id });
  });

  it("recusa foto e áudio juntos, lixo disfarçado e arquivo grande demais, sem gravar nada", async () => {
    expect(await media.saveCommentMedia(form({ photo: await png(), audio: webm() }))).toEqual({
      ok: false,
      error: "Uma foto ou um áudio por comentário, não os dois.",
    });

    const pdf = new File([new TextEncoder().encode("%PDF-1.4 nem de longe uma foto")], "x.png", {
      type: "image/png",
    });
    expect(await media.saveCommentMedia(form({ photo: pdf }))).toEqual({
      ok: false,
      error: "Isso não é uma foto que eu reconheça.",
    });
    expect(await media.saveCommentMedia(form({ audio: pdf }))).toEqual({
      ok: false,
      error: "Isso não é um áudio que eu reconheça.",
    });

    const gigante = new File([new Uint8Array(11 * 1024 * 1024)], "gigante.png", {
      type: "image/png",
    });
    expect(await media.saveCommentMedia(form({ photo: gigante }))).toEqual({
      ok: false,
      error: "Foto grande demais (máximo 10 MB).",
    });
    const audioGigante = new File([new Uint8Array(21 * 1024 * 1024)], "gigante.webm", {
      type: "audio/webm",
    });
    expect(await media.saveCommentMedia(form({ audio: audioGigante }))).toEqual({
      ok: false,
      error: "Áudio grande demais (máximo 20 MB).",
    });

    expect(files()).toEqual([]);
  });
});

describe("deleteCommentMedia", () => {
  it("não reclama de id nulo nem de arquivo que já sumiu", async () => {
    await expect(
      media.deleteCommentMedia([
        { photoId: null, audioId: null },
        { photoId: "abcdefghijklmnop", audioId: "abcdefghijklmnop" },
      ]),
    ).resolves.toBeUndefined();
  });
});
