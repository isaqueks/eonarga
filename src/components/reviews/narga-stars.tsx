import Image from "next/image";

import { formatStars } from "@/lib/format";
import { cn } from "@/lib/utils";

/** Diâmetro do rosto em px por tamanho. */
const FACE_PX = { sm: 16, md: 22, lg: 30 } as const;

export type NargaStarsSize = keyof typeof FACE_PX;

/**
 * A nota em "nargas": cinco rostos do cachorro no lugar das estrelas (docs/01).
 * Meio ponto vira meio rosto com `clip-path`. Server-safe de propósito — o card do
 * ranking, a ficha e o perfil são todos server components.
 */
export function NargaStars({
  stars,
  size = "md",
  className,
}: {
  /** 0 a 5, em meios pontos. */
  stars: number;
  size?: NargaStarsSize;
  className?: string;
}) {
  const value = Math.min(5, Math.max(0, stars));
  const px = FACE_PX[size];

  return (
    <span
      role="img"
      aria-label={`${formatStars(value)} de 5`}
      className={cn("inline-flex shrink-0 items-center gap-0.5 align-middle", className)}
    >
      {[0, 1, 2, 3, 4].map((index) => (
        <NargaFace key={index} fill={Math.min(1, Math.max(0, value - index))} px={px} />
      ))}
    </span>
  );
}

/**
 * Um rosto. O de baixo é o "vazio" (cinza, apagado); o de cima é o cheio, cortado
 * na horizontal conforme `fill` (1 = inteiro, 0,5 = meio, 0 = não desenha).
 */
export function NargaFace({ fill, px }: { fill: number; px: number }) {
  return (
    <span aria-hidden className="relative inline-block shrink-0" style={{ width: px, height: px }}>
      <Image
        src="/icons/logo-face.png"
        alt=""
        width={px}
        height={px}
        className="size-full rounded-full object-cover opacity-20 grayscale"
      />
      {fill > 0 ? (
        <Image
          src="/icons/logo-face.png"
          alt=""
          width={px}
          height={px}
          className="absolute inset-0 size-full rounded-full object-cover"
          style={{ clipPath: `inset(0 ${(1 - fill) * 100}% 0 0)` }}
        />
      ) : null}
    </span>
  );
}
