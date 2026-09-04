import { deleteImage } from "@/lib/storage";

/**
 * Foto importada do Instagram que ainda não virou post: fica "no palco" até a pessoa
 * publicar (ou desistir). Em memória, de propósito — é um processo só, e o pior caso
 * de reiniciar no meio é importar de novo. O que expira sem uso tem os arquivos
 * apagados, pra o disco não juntar foto órfã.
 */
export interface StagedImport {
  /** Id da imagem no storage (`src/lib/storage.ts`). */
  id: string;
  /** Quem importou: só essa pessoa pode publicar ou descartar. */
  userId: string;
  width: number;
  height: number;
  sourceUrl: string;
  sourceAuthor: string | null;
  expiresAt: number;
}

/** Meia hora dá pra escolher o lugar e revisar o texto com folga. */
export const STAGED_IMPORT_TTL_MS = 30 * 60_000;

const staged = new Map<string, StagedImport>();

export function stageImport(
  entry: Omit<StagedImport, "expiresAt">,
  now: number = Date.now(),
): StagedImport {
  // Varredura oportunista: sem timer, quem importa limpa o que os outros deixaram vencer.
  void sweepStagedImports(now);
  const value: StagedImport = { ...entry, expiresAt: now + STAGED_IMPORT_TTL_MS };
  staged.set(entry.id, value);
  return value;
}

function find(id: string, userId: string, now: number): StagedImport | null {
  const entry = staged.get(id);
  if (!entry || entry.userId !== userId) return null;
  if (entry.expiresAt <= now) {
    staged.delete(id);
    void deleteImage(id);
    return null;
  }
  return entry;
}

/** Só olha (o formulário confere se a foto ainda vale). */
export function peekStagedImport(
  id: string,
  userId: string,
  now: number = Date.now(),
): StagedImport | null {
  return find(id, userId, now);
}

/** Tira do palco pra virar post: a partir daqui o dono dos arquivos é a linha em `posts`. */
export function takeStagedImport(
  id: string,
  userId: string,
  now: number = Date.now(),
): StagedImport | null {
  const entry = find(id, userId, now);
  if (entry) staged.delete(id);
  return entry;
}

/** Desistiu: tira do palco e apaga os arquivos. Devolve se havia algo pra descartar. */
export async function discardStagedImport(id: string, userId: string): Promise<boolean> {
  const entry = staged.get(id);
  if (!entry || entry.userId !== userId) return false;
  staged.delete(id);
  await deleteImage(id);
  return true;
}

/** Apaga tudo que venceu (e os arquivos). Devolve quantos foram. */
export async function sweepStagedImports(now: number = Date.now()): Promise<number> {
  const expired = [...staged.values()].filter((entry) => entry.expiresAt <= now);
  for (const entry of expired) staged.delete(entry.id);
  await Promise.all(expired.map((entry) => deleteImage(entry.id)));
  return expired.length;
}

/** Quantas fotos estão no palco (teste e painel). */
export function countStagedImports(): number {
  return staged.size;
}

/** Só pra teste. */
export function clearStagedImports(): void {
  staged.clear();
}
