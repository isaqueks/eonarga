"use client";

import { useRef, useState } from "react";

import { formatStars } from "@/lib/format";
import { cn } from "@/lib/utils";

import { NargaFace } from "./narga-stars";

const MIN = 1;
const MAX = 5;
const STEP = 0.5;
/** Alvo de toque por rosto (docs/04: nada abaixo de 44 px). */
const TARGET = 44;
const FACE = 32;

function clamp(value: number): number {
  return Math.min(MAX, Math.max(MIN, Math.round(value * 2) / 2));
}

/**
 * Entrada de nota em nargas: toque, arraste ou teclado. Meio ponto (docs/01).
 * Envia `rating` (2..10, o inteiro que o banco guarda) num input escondido.
 */
export function NargaRatingInput({
  defaultStars = 0,
  name = "rating",
  onChange,
  className,
}: {
  /** 0 = ainda sem nota. */
  defaultStars?: number;
  name?: string;
  onChange?: (stars: number) => void;
  className?: string;
}) {
  const [stars, setStars] = useState(() => (defaultStars > 0 ? clamp(defaultStars) : 0));
  const [dragging, setDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);

  function commit(next: number) {
    if (next === stars) return;
    setStars(next);
    onChange?.(next);
  }

  /** Nota a partir do X do ponteiro: cada metade de rosto vale meio ponto. */
  function fromClientX(clientX: number): number {
    const row = rowRef.current;
    if (!row) return stars;
    const rect = row.getBoundingClientRect();
    if (rect.width === 0) return stars;
    const ratio = (clientX - rect.left) / rect.width;
    return clamp(Math.ceil(ratio * MAX * 2) / 2);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    let next: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        next = stars === 0 ? MIN : clamp(stars - STEP);
        break;
      case "ArrowRight":
      case "ArrowUp":
        next = stars === 0 ? MIN : clamp(stars + STEP);
        break;
      case "Home":
        next = MIN;
        break;
      case "End":
        next = MAX;
        break;
      case "PageUp":
        next = stars === 0 ? MIN : clamp(stars + 1);
        break;
      case "PageDown":
        next = stars === 0 ? MIN : clamp(stars - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    commit(next);
  }

  const label = stars > 0 ? `${formatStars(stars)} de 5` : "sem nota";

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div
        ref={rowRef}
        role="slider"
        tabIndex={0}
        aria-label="Sua nota"
        aria-valuemin={MIN}
        aria-valuemax={MAX}
        aria-valuenow={stars > 0 ? stars : undefined}
        aria-valuetext={label}
        onKeyDown={handleKeyDown}
        onPointerDown={(event) => {
          // Só botão principal / toque; o `setPointerCapture` mantém o arraste mesmo
          // se o dedo sair da linha dos rostos.
          if (event.button !== 0) return;
          event.preventDefault();
          event.currentTarget.setPointerCapture(event.pointerId);
          setDragging(true);
          commit(fromClientX(event.clientX));
        }}
        onPointerMove={(event) => {
          if (!dragging) return;
          commit(fromClientX(event.clientX));
        }}
        onPointerUp={(event) => {
          setDragging(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onPointerCancel={() => setDragging(false)}
        className="focus-visible:ring-ring/50 flex cursor-pointer touch-none rounded-lg select-none focus-visible:ring-3 focus-visible:outline-none"
      >
        {[0, 1, 2, 3, 4].map((index) => (
          <span
            key={index}
            className="flex items-center justify-center"
            style={{ width: TARGET, height: TARGET }}
          >
            <NargaFace fill={Math.min(1, Math.max(0, stars - index))} px={FACE} />
          </span>
        ))}
      </div>

      <span
        className={cn(
          "text-xl font-semibold tabular-nums",
          stars > 0 ? "text-foreground" : "text-muted-foreground text-base font-normal",
        )}
      >
        {stars > 0 ? formatStars(stars) : "sem nota"}
      </span>

      <input type="hidden" name={name} value={stars > 0 ? String(Math.round(stars * 2)) : ""} />
    </div>
  );
}
