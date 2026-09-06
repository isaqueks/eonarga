"use client";

import { Loader2, Pause, Play } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { AUDIO_PEAKS_COUNT, formatClock } from "@/lib/audio";
import { cn } from "@/lib/utils";

/** Velocidades do botão "1×": toca-se áudio de amigo em 1,5× sem culpa. */
const RATES = [1, 1.5, 2] as const;

const RATE_LABEL: Record<(typeof RATES)[number], string> = { 1: "1×", 1.5: "1,5×", 2: "2×" };

/**
 * Player de áudio no estilo mensagem de voz (docs/08 #47): botão redondo, forma de
 * onda que vai pintando, tempo embaixo e velocidade. O `<audio>` nativo fica escondido
 * — o controle padrão do navegador é feio e cada um é de um jeito.
 *
 * A duração vem do banco (`durationMs`), porque WebM gravado pelo Chrome responde
 * `Infinity` no `duration`; quando não veio, o player usa o que o navegador disser.
 * A forma de onda vem pronta (`peaks`); sem ela, barras iguais. Tocar pausa qualquer
 * outro `<audio>`/`<video>` da página (docs/08 #40).
 */
export function AudioPlayer({
  src,
  durationMs,
  peaks,
  label,
  className,
}: {
  src: string;
  /** Duração medida ao gravar/escolher. 0 = desconhecida. */
  durationMs: number;
  /** Forma de onda (0..1), ou null. */
  peaks: number[] | null;
  /** "Áudio de Fulano" — vira o rótulo do grupo e do botão. */
  label: string;
  className?: string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const frameRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [positionMs, setPositionMs] = useState(0);
  const [knownMs, setKnownMs] = useState(durationMs);
  const [rate, setRate] = useState<(typeof RATES)[number]>(1);

  const totalMs = knownMs > 0 ? knownMs : durationMs;
  const fraction = totalMs > 0 ? Math.min(1, positionMs / totalMs) : 0;

  const bars = useMemo(
    () => (peaks && peaks.length > 0 ? peaks : new Array<number>(AUDIO_PEAKS_COUNT).fill(0.45)),
    [peaks],
  );

  // Enquanto toca, lê o tempo a cada quadro: o `timeupdate` nativo vem a ~4 Hz e a
  // forma de onda pintaria aos trancos.
  useEffect(() => {
    if (!playing) return;
    const tick = () => {
      const audio = audioRef.current;
      if (audio) setPositionMs(audio.currentTime * 1000);
      frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [playing]);

  function toggle() {
    const audio = audioRef.current;
    if (!audio || failed) return;
    if (audio.paused) {
      audio.playbackRate = rate;
      void audio.play().catch(() => setFailed(true));
    } else {
      audio.pause();
    }
  }

  function seekTo(nextFraction: number) {
    const audio = audioRef.current;
    if (!audio || totalMs <= 0) return;
    const clamped = Math.min(1, Math.max(0, nextFraction));
    audio.currentTime = (clamped * totalMs) / 1000;
    setPositionMs(clamped * totalMs);
  }

  function seekFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    seekTo((event.clientX - rect.left) / rect.width);
  }

  function seekFromKey(event: KeyboardEvent<HTMLDivElement>) {
    const step = totalMs > 0 ? 5000 / totalMs : 0;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      event.preventDefault();
      seekTo(fraction + step);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      event.preventDefault();
      seekTo(fraction - step);
    } else if (event.key === "Home") {
      event.preventDefault();
      seekTo(0);
    } else if (event.key === "End") {
      event.preventDefault();
      seekTo(1);
    }
  }

  function cycleRate() {
    const next = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
    setRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  }

  const shown = playing || positionMs > 0 ? positionMs : totalMs;

  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        "border-border bg-secondary/40 flex items-center gap-3 rounded-2xl border py-2 pr-3 pl-2",
        className,
      )}
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={(event) => {
          for (const other of document.querySelectorAll<HTMLMediaElement>("video, audio")) {
            if (other !== event.currentTarget && !other.paused) other.pause();
          }
          setPlaying(true);
          setWaiting(false);
        }}
        onPause={() => setPlaying(false)}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onEnded={() => {
          setPlaying(false);
          setPositionMs(0);
        }}
        onLoadedMetadata={(event) => {
          const seconds = event.currentTarget.duration;
          if (knownMs <= 0 && Number.isFinite(seconds) && seconds > 0) {
            setKnownMs(Math.round(seconds * 1000));
          }
        }}
        onError={() => setFailed(true)}
        className="hidden"
      />

      <button
        type="button"
        onClick={toggle}
        disabled={failed}
        aria-label={playing ? "Pausar" : "Tocar"}
        className="bg-primary text-primary-foreground focus-visible:ring-ring/50 flex size-11 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-3 active:scale-95 disabled:opacity-50"
      >
        {waiting ? (
          <Loader2 className="size-5 animate-spin" aria-hidden />
        ) : playing ? (
          <Pause className="size-5 fill-current" aria-hidden />
        ) : (
          <Play className="ml-0.5 size-5 fill-current" aria-hidden />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Posição"
          aria-valuemin={0}
          aria-valuemax={Math.round(totalMs / 1000)}
          aria-valuenow={Math.round(positionMs / 1000)}
          aria-valuetext={`${formatClock(positionMs)} de ${formatClock(totalMs)}`}
          onPointerDown={seekFromPointer}
          onKeyDown={seekFromKey}
          className="focus-visible:ring-ring/50 flex h-8 cursor-pointer items-center gap-[2px] rounded-md outline-none focus-visible:ring-3"
        >
          {bars.map((peak, index) => {
            const played = index < fraction * bars.length;
            return (
              <span
                key={index}
                aria-hidden
                className={cn(
                  "min-h-[3px] flex-1 rounded-full transition-colors",
                  played ? "bg-primary" : "bg-foreground/25",
                )}
                style={{ height: `${Math.max(10, Math.round(peak * 100))}%` }}
              />
            );
          })}
        </div>
        <div className="text-muted-foreground flex items-center justify-between text-[11px] leading-none tabular-nums">
          {failed ? (
            <span className="text-destructive">Não deu pra tocar esse áudio aqui.</span>
          ) : (
            <span>{formatClock(shown)}</span>
          )}
          <button
            type="button"
            onClick={cycleRate}
            aria-label={`Velocidade ${RATE_LABEL[rate]}`}
            className="hover:text-foreground focus-visible:ring-ring/50 -my-1 -mr-1 rounded px-1 py-1 font-medium outline-none focus-visible:ring-3"
          >
            {RATE_LABEL[rate]}
          </button>
        </div>
      </div>
    </div>
  );
}
