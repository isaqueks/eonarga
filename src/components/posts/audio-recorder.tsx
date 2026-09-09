"use client";

import { Mic, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatClock, RECORDER_MIME_CANDIDATES, recordingExt, resamplePeaks } from "@/lib/audio";
import { AUDIO_MAX_MS } from "@/lib/constants";

/** O que sai do gravador: o arquivo, o que ele é e o que o player precisa saber. */
export interface Recording {
  blob: Blob;
  mime: string;
  ext: "webm" | "m4a" | "ogg";
  durationMs: number;
  peaks: number[];
  /** URL de objeto pra prévia; quem recebe devolve com `URL.revokeObjectURL`. */
  url: string;
}

/** Quantas barras aparecem enquanto grava (as últimas medidas). */
const LIVE_BARS = 40;
/** De quanto em quanto tempo o medidor lê o microfone. */
const METER_MS = 50;

const NO_SUPPORT = "Esse navegador não grava áudio. Manda um da galeria.";
const DENIED = "Sem permissão pro microfone. Libera nas configurações do navegador.";
const NO_MIC = "Não achei microfone nesse aparelho.";
const FAILED = "Não consegui gravar. Tenta de novo ou manda um da galeria.";

/** Tem o que precisa pra gravar? (Chrome, Firefox e Safari 14.3+ têm.) */
export function canRecordAudio(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

/** Nível do sinal (0..1) numa leitura do AnalyserNode: RMS das amostras. */
function readLevel(analyser: AnalyserNode, samples: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(samples);
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.min(1, Math.sqrt(sum / samples.length) * 4);
}

/**
 * Gravador de áudio de post e de comentário (docs/08 #47 e #52): começa a gravar ao
 * aparecer (quem clicou em "Gravar áudio" já quer gravar), mostra o tempo e as últimas
 * barras do medidor, e para sozinho em 5 min. "Parar" entrega o arquivo com a duração medida e a forma de
 * onda; "Cancelar" joga tudo fora. O microfone é solto nos dois casos.
 */
export function AudioRecorder({
  onDone,
  onCancel,
}: {
  onDone: (recording: Recording) => void;
  onCancel: () => void;
}) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [live, setLive] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const levelsRef = useRef<number[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const finishRef = useRef<"done" | "cancel" | null>(null);

  function releaseHardware() {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void contextRef.current?.close().catch(() => {});
    contextRef.current = null;
  }

  // Liga tudo ao montar. No StrictMode o efeito roda, é limpo e roda de novo: a
  // limpeza cancela a primeira ligação (solta o microfone assim que ele responder) e a
  // segunda segue normal. A mesma limpeza solta o microfone se a tela for embora no meio.
  useEffect(() => {
    let cancelled = false;
    finishRef.current = null;

    async function start() {
      if (!canRecordAudio()) {
        setError(NO_SUPPORT);
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (cause) {
        const name = cause instanceof Error ? cause.name : "";
        setError(
          name === "NotAllowedError" || name === "SecurityError"
            ? DENIED
            : name === "NotFoundError"
              ? NO_MIC
              : FAILED,
        );
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;

      const mimeType = RECORDER_MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
      let recorder: MediaRecorder;
      try {
        recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      } catch {
        releaseHardware();
        setError(FAILED);
        return;
      }
      recorderRef.current = recorder;
      chunksRef.current = [];
      levelsRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const durationMs = Math.round(performance.now() - startedAtRef.current);
        releaseHardware();
        if (finishRef.current !== "done") return;
        const mime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: mime });
        onDone({
          blob,
          mime,
          ext: recordingExt(mime),
          durationMs: Math.min(durationMs, AUDIO_MAX_MS),
          peaks: resamplePeaks(levelsRef.current),
          url: URL.createObjectURL(blob),
        });
      };

      // Medidor: o AnalyserNode lê o mesmo stream a cada 50 ms; a série inteira vira a
      // forma de onda no fim, e as últimas barras aparecem enquanto grava.
      try {
        const context = new AudioContext();
        contextRef.current = context;
        const analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        context.createMediaStreamSource(stream).connect(analyser);
        const samples = new Float32Array(analyser.fftSize);
        timerRef.current = window.setInterval(() => {
          const level = readLevel(analyser, samples);
          levelsRef.current.push(level);
          setLive((current) => [...current.slice(-(LIVE_BARS - 1)), level]);
          const elapsed = performance.now() - startedAtRef.current;
          setElapsedMs(elapsed);
          if (elapsed >= AUDIO_MAX_MS) stop();
        }, METER_MS);
      } catch {
        // Sem medidor a gravação segue; só não tem desenho.
        timerRef.current = window.setInterval(() => {
          const elapsed = performance.now() - startedAtRef.current;
          setElapsedMs(elapsed);
          if (elapsed >= AUDIO_MAX_MS) stop();
        }, METER_MS);
      }

      startedAtRef.current = performance.now();
      recorder.start(250);
      setReady(true);
    }

    void start();
    return () => {
      cancelled = true;
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        finishRef.current ??= "cancel";
        recorder.stop();
      } else {
        releaseHardware();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stop() {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive" || finishRef.current) return;
    finishRef.current = "done";
    recorder.stop();
  }

  function cancel() {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive" && !finishRef.current) {
      finishRef.current = "cancel";
      recorder.stop();
    } else {
      releaseHardware();
    }
    onCancel();
  }

  if (error) {
    return (
      <div className="border-border flex flex-col gap-2 rounded-xl border p-3">
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
        <Button type="button" variant="outline" size="lg" className="h-10" onClick={cancel}>
          Fechar
        </Button>
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label="Gravando áudio"
      className="border-border bg-secondary/40 flex flex-col gap-3 rounded-xl border p-3"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex size-3 shrink-0">
          <span className="bg-destructive absolute inline-flex size-full animate-ping rounded-full opacity-75" />
          <span className="bg-destructive relative inline-flex size-3 rounded-full" />
        </span>
        <span className="text-sm font-medium">{ready ? "Gravando" : "Ligando o microfone…"}</span>
        <span role="timer" className="ml-auto text-sm tabular-nums">
          {formatClock(elapsedMs)}
        </span>
      </div>

      <div aria-hidden className="flex h-10 items-center justify-end gap-[3px]">
        {Array.from({ length: LIVE_BARS }, (_, i) => {
          const level = live[i - (LIVE_BARS - live.length)] ?? 0;
          return (
            <span
              key={i}
              className="bg-primary w-1 rounded-full"
              style={{ height: `${Math.max(8, Math.round(level * 100))}%` }}
            />
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          size="lg"
          className="h-11 flex-1"
          disabled={!ready}
          onClick={stop}
          aria-label="Parar gravação"
        >
          <Square className="size-4 fill-current" aria-hidden />
          Parar
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="h-11"
          onClick={cancel}
          aria-label="Cancelar gravação"
        >
          <X className="size-4" aria-hidden />
          Cancelar
        </Button>
      </div>
      <p className="text-muted-foreground flex items-center gap-1 text-xs">
        <Mic className="size-3" aria-hidden />
        Para sozinho em {Math.round(AUDIO_MAX_MS / 60_000)} min.
      </p>
    </div>
  );
}

/**
 * Duração e forma de onda de um áudio escolhido da galeria, do jeito que der: a
 * duração vem de um `<audio>` escondido e a forma de onda de `decodeAudioData`
 * (que decodifica o arquivo inteiro na memória, por isso só até o limite do post).
 * Qualquer tropeço vira 0 / null e o post entra igual.
 */
export async function analyzeAudioFile(
  file: File,
): Promise<{ durationMs: number; peaks: number[] | null }> {
  let durationMs = 0;
  let peaks: number[] | null = null;

  try {
    const context = new AudioContext();
    try {
      const decoded = await context.decodeAudioData(await file.arrayBuffer());
      durationMs = Math.round(decoded.duration * 1000);
      peaks = resamplePeaks(decoded.getChannelData(0));
    } finally {
      await context.close().catch(() => {});
    }
  } catch {
    // Formato que o navegador não decodifica (ou arquivo estranho): sem desenho.
  }

  if (durationMs === 0) {
    durationMs = await new Promise<number>((resolve) => {
      const url = URL.createObjectURL(file);
      const probe = new Audio();
      const finish = (ms: number) => {
        URL.revokeObjectURL(url);
        resolve(ms);
      };
      probe.preload = "metadata";
      probe.onloadedmetadata = () =>
        finish(Number.isFinite(probe.duration) ? Math.round(probe.duration * 1000) : 0);
      probe.onerror = () => finish(0);
      probe.src = url;
    });
  }

  return { durationMs: Math.min(durationMs, AUDIO_MAX_MS), peaks };
}
