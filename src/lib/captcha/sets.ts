/**
 * Os desafios do reNARGA (ver docs/09-captcha-de-zoeira.md).
 *
 * Nada aqui é verificado: não existe gabarito, qualquer resposta passa. A lista
 * só decide o que aparece na tela. Pra adicionar um desafio, acrescente um item
 * em CAPTCHA_SETS apontando pra imagens que existam em `public/`.
 *
 * Os desafios 2 (carvão, grid16) e 8 (a Figueira) ficam de fora até alguém
 * tirar as fotos.
 */

export type CaptchaLayout = "grid9" | "grid16" | "text";

export interface CaptchaTile {
  src: string;
  alt: string;
}

export interface CaptchaSet {
  id: string;
  /** "Selecione todas as imagens com" */
  prompt: string;
  /** palavra em destaque, ex.: "narguilé" */
  keyword: string;
  layout: CaptchaLayout;
  /** grid9: 9+ tiles (pode ter extras pra rodada "selecione também"); grid16: 1 imagem; text: 1 imagem */
  tiles: CaptchaTile[];
}

const T = "/captcha/tiles";
const D = "/captcha/dog";

/** Frase padrão dos desafios de grade. */
const PROMPT = "Selecione todas as imagens com";

export const CAPTCHA_SETS: CaptchaSet[] = [
  // 1 — metade parece narguilé e não é
  {
    id: "narguile",
    prompt: PROMPT,
    keyword: "narguilé",
    layout: "grid9",
    tiles: [
      { src: `${T}/narguile-alto.svg`, alt: "narguilé alto de vidro" },
      { src: `${T}/abajur.svg`, alt: "abajur de cúpula" },
      { src: `${T}/vaso-flor.svg`, alt: "vaso com uma flor" },
      { src: `${T}/narguile-baixo.svg`, alt: "narguilé baixo de barro" },
      { src: `${T}/liquidificador.svg`, alt: "liquidificador" },
      { src: `${T}/luminaria-lava.svg`, alt: "luminária de lava" },
      { src: `${T}/garrafa-termica.svg`, alt: "garrafa térmica" },
      { src: `${T}/narguile-duplo.svg`, alt: "narguilé de duas mangueiras" },
      { src: `${T}/extintor.svg`, alt: "extintor de incêndio" },
      // extras
      { src: `${T}/samovar.svg`, alt: "samovar" },
      { src: `${T}/narguile-mangueira.svg`, alt: "narguilé com a mangueira enrolada" },
      { src: `${T}/rosh.svg`, alt: "rosh de barro" },
    ],
  },

  // 3 — o cachorro não tem fumaça, mas as pessoas marcam
  {
    id: "fumaca",
    prompt: PROMPT,
    keyword: "fumaça",
    layout: "grid9",
    tiles: [
      { src: `${T}/nuvem.svg`, alt: "nuvem no céu" },
      { src: `${T}/chamine.svg`, alt: "chaminé soltando fumaça" },
      { src: `${T}/vape.svg`, alt: "vape soltando vapor" },
      { src: `${T}/incenso.svg`, alt: "incenso aceso" },
      { src: `${T}/churrasqueira.svg`, alt: "churrasqueira acesa" },
      { src: `${T}/nevoa.svg`, alt: "névoa sobre o morro" },
      { src: `${D}/narga-rosto.webp`, alt: "o cachorro do meme" },
      { src: `${T}/narguile-alto.svg`, alt: "narguilé alto de vidro" },
      { src: `${T}/narguile-mangueira.svg`, alt: "narguilé com a mangueira enrolada" },
      // extras
      { src: `${D}/narga-desfocado.webp`, alt: "o cachorro do meme, desfocado" },
      { src: `${T}/luminaria-lava.svg`, alt: "luminária de lava" },
      { src: `${D}/narga-verde.webp`, alt: "o cachorro do meme, esverdeado" },
    ],
  },

  // 4 — todas são mangueira, dependendo do ponto de vista
  {
    id: "mangueira",
    prompt: PROMPT,
    keyword: "mangueira",
    layout: "grid9",
    tiles: [
      { src: `${T}/mangueira-narguile.svg`, alt: "mangueira de narguilé" },
      { src: `${T}/mangueira-jardim.svg`, alt: "mangueira de jardim" },
      { src: `${T}/manga-fruta.svg`, alt: "manga madura" },
      { src: `${T}/mangueira-arvore.svg`, alt: "mangueira carregada de manga" },
      { src: `${T}/bombeiro.svg`, alt: "bombeiro com a mangueira" },
      { src: `${T}/tromba-elefante.svg`, alt: "elefante de tromba erguida" },
      { src: `${T}/cabo-usb.svg`, alt: "cabo USB" },
      { src: `${T}/macarrao.svg`, alt: "tigela de macarrão" },
      { src: `${T}/narguile-mangueira.svg`, alt: "narguilé com a mangueira enrolada" },
      // extras
      { src: `${T}/mangueira-enrolada.svg`, alt: "mangueira enrolada no carretel" },
      { src: `${T}/manga-fatia.svg`, alt: "fatia de manga" },
      { src: `${T}/mangueira-incendio.svg`, alt: "caixa de mangueira de incêndio" },
    ],
  },

  // 5 — meta
  {
    id: "o-narga",
    prompt: PROMPT,
    keyword: "o narga",
    layout: "grid9",
    tiles: [
      { src: `${D}/narga-rosto.webp`, alt: "o cachorro do meme" },
      { src: `${T}/gato.svg`, alt: "gato cinza" },
      { src: `${D}/narga-espelhado.webp`, alt: "o cachorro do meme, espelhado" },
      { src: `${T}/cachorro-1.svg`, alt: "cachorro marrom" },
      { src: `${D}/narga-negativo.webp`, alt: "o cachorro do meme, em negativo" },
      { src: `${T}/cachorro-2.svg`, alt: "cachorro preto de perfil" },
      { src: `${D}/narga-verde.webp`, alt: "o cachorro do meme, esverdeado" },
      { src: `${D}/narga-desfocado.webp`, alt: "o cachorro do meme, desfocado" },
      { src: `${D}/narga-olhos.webp`, alt: "close nos olhos do cachorro do meme" },
      // extras
      { src: `${T}/cachorro-3.svg`, alt: "cachorro de orelha caída" },
      { src: `${T}/gato-preto.svg`, alt: "gato preto" },
      { src: `${T}/cachorro-4.svg`, alt: "cachorro branco" },
    ],
  },

  // 7 — a cuia de chimarrão divide o grupo
  {
    id: "rosh",
    prompt: PROMPT,
    keyword: "rosh",
    layout: "grid9",
    tiles: [
      { src: `${T}/rosh.svg`, alt: "rosh de barro" },
      { src: `${T}/cinzeiro.svg`, alt: "cinzeiro com um cigarro" },
      { src: `${T}/caneca.svg`, alt: "caneca fumegando" },
      { src: `${T}/rosh-2.svg`, alt: "rosh de silicone preto" },
      { src: `${T}/bonsai.svg`, alt: "bonsai no vaso" },
      { src: `${T}/cuia-chimarrao.svg`, alt: "cuia de chimarrão com bomba" },
      { src: `${T}/rosh-3.svg`, alt: "rosh verde de fenda" },
      { src: `${T}/vaso-flor.svg`, alt: "vaso com uma flor" },
      { src: `${T}/narguile-alto.svg`, alt: "narguilé alto de vidro" },
      // extras
      { src: `${T}/garrafa-termica.svg`, alt: "garrafa térmica" },
      { src: `${T}/abajur.svg`, alt: "abajur de cúpula" },
      { src: `${T}/samovar.svg`, alt: "samovar" },
    ],
  },

  // 9 — oito caixas iguais e uma de melancia
  {
    id: "essencia-menta",
    prompt: PROMPT,
    keyword: "essência de menta",
    layout: "grid9",
    tiles: [
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      { src: `${T}/essencia-melancia.svg`, alt: "caixa vermelha de essência" },
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      // extras
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
      { src: `${T}/essencia-menta-2.svg`, alt: "outra caixa verde de essência" },
      { src: `${T}/essencia-menta.svg`, alt: "caixa verde de essência" },
    ],
  },

  // 10 — nostalgia; aceita qualquer coisa
  {
    id: "texto",
    prompt: "Digite o texto acima",
    keyword: "",
    layout: "text",
    tiles: [{ src: "/captcha/text/e-o-narga.svg", alt: "texto distorcido" }],
  },

  // 11 — o clássico invertido; a resposta certa é "Pular"
  {
    id: "semaforos",
    prompt: PROMPT,
    keyword: "semáforos",
    layout: "grid9",
    tiles: [
      { src: `${T}/narguile-alto.svg`, alt: "narguilé alto de vidro" },
      { src: `${T}/narguile-baixo.svg`, alt: "narguilé baixo de barro" },
      { src: `${T}/narguile-duplo.svg`, alt: "narguilé de duas mangueiras" },
      { src: `${T}/narguile-mangueira.svg`, alt: "narguilé com a mangueira enrolada" },
      { src: `${T}/mangueira-narguile.svg`, alt: "mangueira de narguilé" },
      { src: `${T}/rosh.svg`, alt: "rosh de barro" },
      { src: `${T}/rosh-2.svg`, alt: "rosh de silicone preto" },
      { src: `${T}/rosh-3.svg`, alt: "rosh verde de fenda" },
      { src: `${T}/samovar.svg`, alt: "samovar" },
      // extras
      { src: `${T}/narguile-alto.svg`, alt: "narguilé alto de vidro" },
      { src: `${T}/narguile-baixo.svg`, alt: "narguilé baixo de barro" },
      { src: `${T}/narguile-duplo.svg`, alt: "narguilé de duas mangueiras" },
    ],
  },
];

/**
 * Sorteia um desafio. Passe `exceptId` pra não repetir o que está na tela
 * (é o que o botão de recarregar faz).
 */
export function pickRandomSet(exceptId?: string): CaptchaSet {
  const pool = exceptId ? CAPTCHA_SETS.filter((set) => set.id !== exceptId) : CAPTCHA_SETS;
  const list = pool.length > 0 ? pool : CAPTCHA_SETS;
  return list[Math.floor(Math.random() * list.length)];
}
