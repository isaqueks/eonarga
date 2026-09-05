import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type VideoModule = typeof import("./video-storage");

let video: VideoModule;
let tmpDir: string;

const FIXTURES = path.resolve("e2e/fixtures");
const mp4 = () => fs.readFileSync(path.join(FIXTURES, "tiny.mp4"));
const mp4Rotated = () => fs.readFileSync(path.join(FIXTURES, "tiny-rotated.mp4"));
const webm = () => fs.readFileSync(path.join(FIXTURES, "tiny.webm"));

/** Stream web feito na mão: o adaptador `Readable.toWeb` reclama quando é cancelado no meio. */
function toWebStream(chunks: Buffer[]): ReadableStream<Uint8Array> {
  const queue = chunks.map((c) => new Uint8Array(c));
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = queue.shift();
      if (next) controller.enqueue(next);
      else controller.close();
    },
  });
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-video-"));
  process.env.UPLOAD_DIR = tmpDir;
  video = await import("./video-storage");
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // No Windows o arquivo às vezes segue travado por um instante.
  }
});

describe("sniffVideoExt", () => {
  it("reconhece MP4 (ftyp com marca conhecida) e WebM (EBML com doctype webm)", () => {
    expect(video.sniffVideoExt(mp4())).toBe("mp4");
    expect(video.sniffVideoExt(mp4Rotated())).toBe("mp4");
    expect(video.sniffVideoExt(webm())).toBe("webm");
  });

  it("aceita QuickTime de iPhone e recusa HEIC, imagem, Matroska e lixo", () => {
    const qt = Buffer.concat([
      Buffer.from([0, 0, 0, 20]),
      Buffer.from("ftypqt  "),
      Buffer.alloc(8),
    ]);
    expect(video.sniffVideoExt(qt)).toBe("mp4");

    const heic = Buffer.concat([
      Buffer.from([0, 0, 0, 20]),
      Buffer.from("ftypheic"),
      Buffer.alloc(8),
    ]);
    expect(video.sniffVideoExt(heic)).toBeNull();

    const mkv = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from("matroska"),
      Buffer.alloc(60),
    ]);
    expect(video.sniffVideoExt(mkv)).toBeNull();

    expect(
      video.sniffVideoExt(Buffer.from([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])),
    ).toBeNull();
    expect(video.sniffVideoExt(Buffer.alloc(4))).toBeNull();
  });
});

describe("parseMp4Dimensions", () => {
  it("lê largura e altura do tkhd", () => {
    expect(video.parseMp4Dimensions(mp4())).toEqual({ width: 32, height: 24 });
    expect(video.parseMp4Dimensions(mp4Rotated())).toEqual({ width: 32, height: 48 });
  });

  it("troca largura por altura quando a matriz do tkhd diz 90°", () => {
    const buf = Buffer.from(mp4());
    // Acha o tkhd e escreve a matriz de 90°: a=0 b=1 c=-1 d=0 (ponto fixo 16.16).
    const at = buf.indexOf("tkhd") + 4;
    const version = buf[at];
    const matrixAt = at + (version === 1 ? 52 : 40);
    buf.writeInt32BE(0, matrixAt);
    buf.writeInt32BE(0x00010000, matrixAt + 4);
    buf.writeInt32BE(-0x00010000, matrixAt + 12);
    buf.writeInt32BE(0, matrixAt + 16);
    expect(video.parseMp4Dimensions(buf)).toEqual({ width: 24, height: 32 });
  });

  it("devolve null pra WebM e pra MP4 sem moov", () => {
    expect(video.parseMp4Dimensions(webm())).toBeNull();
    expect(video.parseMp4Dimensions(mp4().subarray(0, 40))).toBeNull();
  });
});

describe("saveVideo / saveVideoStream / deleteVideo", () => {
  it("grava, acha, serve um trecho e apaga", async () => {
    const saved = await video.saveVideo(mp4(), "mp4");
    expect(saved).toMatchObject({ ext: "mp4", bytes: mp4().byteLength });
    expect(await video.statVideo(saved.id, "mp4")).toBe(mp4().byteLength);
    expect(await video.statVideo(saved.id, "webm")).toBeNull();

    const chunks: Buffer[] = [];
    for await (const chunk of video.readVideoRange(saved.id, "mp4", 4, 7))
      chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString("ascii")).toBe("ftyp");

    await video.deleteVideo(saved.id);
    expect(await video.statVideo(saved.id, "mp4")).toBeNull();
  });

  it("stream: grava em pedaços e respeita o teto, apagando o parcial", async () => {
    const data = mp4();
    const half = Math.floor(data.byteLength / 2);
    const saved = await video.saveVideoStream(
      toWebStream([data.subarray(0, half), data.subarray(half)]),
      "mp4",
    );
    expect(saved.bytes).toBe(data.byteLength);
    expect(fs.readFileSync(video.videoPath(saved.id, "mp4")).equals(data)).toBe(true);

    await expect(
      video.saveVideoStream(toWebStream([data.subarray(0, half), data.subarray(half)]), "mp4", 100),
    ).rejects.toBeInstanceOf(video.VideoTooBigError);
    const leftovers = fs.readdirSync(tmpDir).filter((f) => f.endsWith(".mp4"));
    expect(leftovers).toEqual([`${saved.id}.mp4`]);
  });
});
