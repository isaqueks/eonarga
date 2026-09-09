import { isAudioExt, type AudioExt } from "@/lib/audio-storage";
import { parseStoredPeaks } from "@/lib/audio";

/**
 * Foto e áudio prontos pra tela, como o post e o comentário (docs/08 #52) entregam
 * pros cards: as URLs das rotas autenticadas e o que o player precisa saber.
 */

export interface MediaPhoto {
  id: string;
  /** Variante grande. */
  url: string;
  /** Quadrada, 400 px. */
  thumbUrl: string;
  width: number;
  height: number;
}

export interface MediaAudio {
  id: string;
  /** `/api/audios/<id>.<ext>`, com Range. */
  url: string;
  ext: AudioExt;
  /** Duração medida pelo navegador ao gravar/escolher; 0 quando não veio. */
  durationMs: number;
  /** Forma de onda (0..1), ou null: aí o player desenha barras iguais. */
  peaks: number[] | null;
}

/** As colunas de foto como estão no banco (post ou comentário). */
export interface PhotoColumns {
  photoId: string | null;
  photoWidth: number | null;
  photoHeight: number | null;
}

/** As colunas de áudio como estão no banco (post ou comentário). */
export interface AudioColumns {
  audioId: string | null;
  audioExt: string | null;
  audioDurationMs: number | null;
  audioPeaks: string | null;
}

export function toMediaPhoto(row: PhotoColumns): MediaPhoto | null {
  if (!row.photoId) return null;
  return {
    id: row.photoId,
    url: `/api/uploads/${row.photoId}`,
    thumbUrl: `/api/uploads/${row.photoId}?v=thumb`,
    width: row.photoWidth ?? 0,
    height: row.photoHeight ?? 0,
  };
}

/** Extensão que não é das nossas (linha mexida na mão) é tratada como "sem áudio". */
export function toMediaAudio(row: AudioColumns): MediaAudio | null {
  if (!row.audioId || !row.audioExt || !isAudioExt(row.audioExt)) return null;
  return {
    id: row.audioId,
    url: `/api/audios/${row.audioId}.${row.audioExt}`,
    ext: row.audioExt,
    durationMs: row.audioDurationMs ?? 0,
    peaks: parseStoredPeaks(row.audioPeaks),
  };
}
