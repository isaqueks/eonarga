import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type AudioModule = typeof import("./audio-storage");

let audio: AudioModule;
let tmpDir: string;

const FIXTURES = path.resolve("e2e/fixtures");
const webm = () => fs.readFileSync(path.join(FIXTURES, "tiny.webm"));
const mp4 = () => fs.readFileSync(path.join(FIXTURES, "tiny.mp4"));
/** 0,2 s de senoide de 440 Hz, mono, 8 kHz, 16 bits (gerado uma vez; ver docs/08 #47). */
const wav = () => fs.readFileSync(path.join(FIXTURES, "tiny.wav"));

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-audio-"));
  process.env.UPLOAD_DIR = tmpDir;
  audio = await import("./audio-storage");
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // No Windows o arquivo às vezes segue travado por um instante.
  }
});

describe("sniffAudioExt", () => {
  it("reconhece WebM, MP4/M4A, Ogg, MP3 e WAV", () => {
    expect(audio.sniffAudioExt(webm())).toBe("webm");
    expect(audio.sniffAudioExt(mp4())).toBe("m4a");
    const m4a = Buffer.concat([
      Buffer.from([0, 0, 0, 20]),
      Buffer.from("ftypM4A "),
      Buffer.alloc(8),
    ]);
    expect(audio.sniffAudioExt(m4a)).toBe("m4a");
    expect(audio.sniffAudioExt(Buffer.concat([Buffer.from("OggS"), Buffer.alloc(24)]))).toBe("ogg");
    expect(audio.sniffAudioExt(Buffer.concat([Buffer.from("ID3"), Buffer.alloc(24)]))).toBe("mp3");
    expect(
      audio.sniffAudioExt(Buffer.concat([Buffer.from([0xff, 0xfb, 0x90, 0x00]), Buffer.alloc(24)])),
    ).toBe("mp3");
    expect(audio.sniffAudioExt(wav())).toBe("wav");
  });

  it("recusa Matroska, RIFF que não é WAVE, imagem e lixo", () => {
    const mkv = Buffer.concat([
      Buffer.from([0x1a, 0x45, 0xdf, 0xa3]),
      Buffer.from("matroska"),
      Buffer.alloc(24),
    ]);
    expect(audio.sniffAudioExt(mkv)).toBeNull();
    const avi = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("AVI ")]);
    expect(audio.sniffAudioExt(avi)).toBeNull();
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(24)]);
    expect(audio.sniffAudioExt(png)).toBeNull();
    expect(audio.sniffAudioExt(Buffer.from("isso nao e audio nenhum"))).toBeNull();
    expect(audio.sniffAudioExt(Buffer.alloc(4))).toBeNull();
  });
});

describe("saveAudio / statAudio / readAudioRange / deleteAudio", () => {
  it("grava como veio, mede, lê um trecho e apaga", async () => {
    const input = wav();
    const stored = await audio.saveAudio(input, "wav");
    expect(stored.ext).toBe("wav");
    expect(stored.bytes).toBe(input.length);
    expect(fs.existsSync(path.join(tmpDir, `${stored.id}.wav`))).toBe(true);

    expect(await audio.statAudio(stored.id, "wav")).toBe(input.length);
    expect(await audio.statAudio(stored.id, "mp3")).toBeNull();
    expect(await audio.statAudio("../../etc/passwd", "wav")).toBeNull();

    const chunks: Buffer[] = [];
    for await (const chunk of audio.readAudioRange(stored.id, "wav", 0, 3)) {
      chunks.push(chunk as Buffer);
    }
    expect(Buffer.concat(chunks).toString("ascii")).toBe("RIFF");

    await audio.deleteAudio(stored.id);
    expect(await audio.statAudio(stored.id, "wav")).toBeNull();
    await expect(audio.deleteAudio(stored.id)).resolves.toBeUndefined();
  });
});
