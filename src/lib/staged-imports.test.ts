import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

type StagedModule = typeof import("./staged-imports");
type StorageModule = typeof import("./storage");

let staged: StagedModule;
let storage: StorageModule;
let tmpDir: string;

const T0 = 1_700_000_000_000;

function entry(id: string, userId = "user-ana") {
  return {
    id,
    userId,
    width: 800,
    height: 600,
    sourceUrl: "https://www.instagram.com/p/x/",
    sourceAuthor: "nasa",
  };
}

/** Cria os dois arquivos que o storage criaria, pra conferir se somem. */
function touch(id: string) {
  fs.writeFileSync(storage.imagePath(id, "full"), "x");
  fs.writeFileSync(storage.imagePath(id, "thumb"), "x");
}

function exists(id: string): boolean {
  return (
    fs.existsSync(storage.imagePath(id, "full")) || fs.existsSync(storage.imagePath(id, "thumb"))
  );
}

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-staged-"));
  process.env.UPLOAD_DIR = tmpDir;
  storage = await import("./storage");
  staged = await import("./staged-imports");
});

afterAll(() => {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // No Windows o arquivo às vezes segue travado por um instante.
  }
});

beforeEach(() => {
  staged.clearStagedImports();
});

describe("staged imports", () => {
  it("guarda e devolve pro dono; outra pessoa não vê", () => {
    staged.stageImport(entry("abcdefghijklmn01"), T0);
    expect(staged.peekStagedImport("abcdefghijklmn01", "user-ana", T0 + 1000)).toMatchObject({
      id: "abcdefghijklmn01",
      sourceAuthor: "nasa",
      expiresAt: T0 + staged.STAGED_IMPORT_TTL_MS,
    });
    expect(staged.peekStagedImport("abcdefghijklmn01", "user-bia", T0 + 1000)).toBeNull();
    expect(staged.peekStagedImport("naoexiste000000x", "user-ana", T0)).toBeNull();
  });

  it("take tira do palco (só uma vez) e não mexe nos arquivos", () => {
    touch("abcdefghijklmn02");
    staged.stageImport(entry("abcdefghijklmn02"), T0);
    expect(staged.takeStagedImport("abcdefghijklmn02", "user-ana", T0)).not.toBeNull();
    expect(staged.takeStagedImport("abcdefghijklmn02", "user-ana", T0)).toBeNull();
    expect(exists("abcdefghijklmn02")).toBe(true);
  });

  it("vencido some e leva os arquivos junto", () => {
    touch("abcdefghijklmn03");
    staged.stageImport(entry("abcdefghijklmn03"), T0);
    const later = T0 + staged.STAGED_IMPORT_TTL_MS + 1;
    expect(staged.peekStagedImport("abcdefghijklmn03", "user-ana", later)).toBeNull();
    expect(staged.countStagedImports()).toBe(0);
  });

  it("descartar apaga os arquivos; só o dono descarta", async () => {
    touch("abcdefghijklmn04");
    staged.stageImport(entry("abcdefghijklmn04"), T0);
    expect(await staged.discardStagedImport("abcdefghijklmn04", "user-bia")).toBe(false);
    expect(exists("abcdefghijklmn04")).toBe(true);
    expect(await staged.discardStagedImport("abcdefghijklmn04", "user-ana")).toBe(true);
    expect(exists("abcdefghijklmn04")).toBe(false);
    expect(await staged.discardStagedImport("abcdefghijklmn04", "user-ana")).toBe(false);
  });

  it("a varredura apaga só o que venceu", async () => {
    touch("abcdefghijklmn05");
    touch("abcdefghijklmn06");
    staged.stageImport(entry("abcdefghijklmn05"), T0);
    staged.stageImport(entry("abcdefghijklmn06"), T0 + 10 * 60_000);
    const removed = await staged.sweepStagedImports(T0 + staged.STAGED_IMPORT_TTL_MS + 1);
    expect(removed).toBe(1);
    expect(exists("abcdefghijklmn05")).toBe(false);
    expect(exists("abcdefghijklmn06")).toBe(true);
    expect(staged.countStagedImports()).toBe(1);
  });
});
