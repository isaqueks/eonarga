import { field } from "@/actions/form-state";
import { parseDurationMs, parsePeaks } from "@/lib/audio";
import {
  deleteAudio,
  MAX_AUDIO_BYTES,
  saveAudio,
  sniffAudioExt,
  type AudioExt,
} from "@/lib/audio-storage";
import { deleteImage, MAX_UPLOAD_BYTES, saveImage, sniffImageMime } from "@/lib/storage";

/**
 * Foto ou áudio num comentário (docs/08 #52), em post ou em resposta de avaliação.
 *
 * As duas actions de comentar recebem o mesmo formulário (`photo` e `audio` como
 * `File`, mais `audioDurationMs`/`audioPeaks` do navegador) e passam por aqui: as
 * mesmas regras da mídia de post (docs/05, "Upload malicioso") — foto reprocessada
 * pelo sharp, áudio conferido pelo contêiner e guardado como veio — só que menor
 * (1200 px) e um anexo por comentário.
 */

/** Foto de comentário é pra ver dentro da thread: menor que a de post. */
export const COMMENT_PHOTO_MAX_SIZE = 1200;
export const COMMENT_PHOTO_THUMB_SIZE = 400;

export interface CommentPhotoRef {
  id: string;
  width: number;
  height: number;
}

export interface CommentAudioRef {
  id: string;
  ext: AudioExt;
  durationMs: number;
  peaks: number[] | null;
}

export interface CommentMedia {
  photo: CommentPhotoRef | null;
  audio: CommentAudioRef | null;
}

export const EMPTY_COMMENT_MEDIA: CommentMedia = { photo: null, audio: null };

export type CommentMediaResult = { ok: true; media: CommentMedia } | { ok: false; error: string };

export const PHOTO_TOO_BIG = "Foto grande demais (máximo 10 MB).";
export const AUDIO_TOO_BIG = "Áudio grande demais (máximo 20 MB).";
export const NOT_A_PHOTO = "Isso não é uma foto que eu reconheça.";
export const NOT_AUDIO = "Isso não é um áudio que eu reconheça.";
// O sharp que vem pronto só decodifica HEIF em AV1; HEIC de iPhone (HEVC) fica de fora.
export const HEIC_NOT_SUPPORTED = "Não consegui abrir essa foto. Tenta mandar em JPEG ou PNG.";
export const ONE_ATTACHMENT = "Uma foto ou um áudio por comentário, não os dois.";
export const SAVE_FAILED = "Não deu pra salvar. Tenta de novo.";

/** O arquivo do campo, se veio um de verdade (vazio conta como "não veio"). */
function fileOf(formData: FormData, name: string): File | null {
  const value = formData.get(name);
  return value instanceof File && value.size > 0 ? value : null;
}

/** Veio foto ou áudio no formulário? Decide "tem texto ou mídia" antes de tocar o disco. */
export function hasCommentMedia(formData: FormData): boolean {
  return fileOf(formData, "photo") !== null || fileOf(formData, "audio") !== null;
}

/**
 * Valida e grava o anexo do comentário. Sem anexo, devolve a mídia vazia. Erro vem
 * como mensagem pronta pra tela; nesse caso nada ficou no disco.
 */
export async function saveCommentMedia(formData: FormData): Promise<CommentMediaResult> {
  const photo = fileOf(formData, "photo");
  const audio = fileOf(formData, "audio");
  if (photo && audio) return { ok: false, error: ONE_ATTACHMENT };

  if (photo) {
    // Foto grande demais nem é aberta.
    if (photo.size > MAX_UPLOAD_BYTES) return { ok: false, error: PHOTO_TOO_BIG };
    const buffer = Buffer.from(await photo.arrayBuffer());
    // O `Content-Type` do upload é chute do cliente: quem manda é o magic byte (docs/05).
    const mime = sniffImageMime(buffer);
    if (!mime) return { ok: false, error: NOT_A_PHOTO };
    try {
      const saved = await saveImage(buffer, {
        maxSize: COMMENT_PHOTO_MAX_SIZE,
        thumbSize: COMMENT_PHOTO_THUMB_SIZE,
      });
      return {
        ok: true,
        media: { photo: { id: saved.id, width: saved.width, height: saved.height }, audio: null },
      };
    } catch {
      const heic = mime === "image/heic" || mime === "image/heif";
      return { ok: false, error: heic ? HEIC_NOT_SUPPORTED : NOT_A_PHOTO };
    }
  }

  if (audio) {
    if (audio.size > MAX_AUDIO_BYTES) return { ok: false, error: AUDIO_TOO_BIG };
    const buffer = Buffer.from(await audio.arrayBuffer());
    const ext = sniffAudioExt(buffer);
    if (!ext) return { ok: false, error: NOT_AUDIO };
    try {
      const stored = await saveAudio(buffer, ext);
      // Duração e forma de onda vêm do navegador, só pra exibição: lixo vira 0 / null.
      return {
        ok: true,
        media: {
          photo: null,
          audio: {
            id: stored.id,
            ext: stored.ext,
            durationMs: parseDurationMs(field(formData, "audioDurationMs")) ?? 0,
            peaks: parsePeaks(field(formData, "audioPeaks")),
          },
        },
      };
    } catch {
      return { ok: false, error: SAVE_FAILED };
    }
  }

  return { ok: true, media: EMPTY_COMMENT_MEDIA };
}

/** As colunas do comentário, prontas pro `insert`. */
export function commentMediaValues(media: CommentMedia) {
  return {
    photoId: media.photo?.id ?? null,
    photoWidth: media.photo?.width ?? null,
    photoHeight: media.photo?.height ?? null,
    audioId: media.audio?.id ?? null,
    audioExt: media.audio?.ext ?? null,
    audioDurationMs: media.audio?.durationMs ?? null,
    audioPeaks: media.audio?.peaks ? JSON.stringify(media.audio.peaks) : null,
  };
}

/** O que precisa pra apagar os arquivos de um comentário: só os ids. */
export interface CommentMediaIds {
  photoId: string | null;
  audioId: string | null;
}

/**
 * Apaga os arquivos de um ou vários comentários. Chamar depois de a linha sumir do
 * banco (ou de o insert falhar): sem linha, arquivo é lixo. Sem arquivo, não reclama.
 */
export async function deleteCommentMedia(rows: CommentMediaIds | CommentMediaIds[]): Promise<void> {
  const list = Array.isArray(rows) ? rows : [rows];
  await Promise.all(
    list.flatMap((row) => [
      row.photoId ? deleteImage(row.photoId) : Promise.resolve(),
      row.audioId ? deleteAudio(row.audioId) : Promise.resolve(),
    ]),
  );
}
