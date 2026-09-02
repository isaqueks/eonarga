"use client";

/*
 * reNARGA — o reCAPTCHA falso do login (spec em docs/09-captcha-de-zoeira.md).
 *
 * Não valida nada: qualquer resposta passa, inclusive nenhuma. O objetivo é
 * parecer o reCAPTCHA v2 de verdade no primeiro segundo e virar piada no
 * segundo. A proteção real do login é o rate limit, não isto.
 *
 * Os tiles são SVG e webp servidos de public/; next/image não otimiza SVG sem
 * `dangerouslyAllowSVG` e aqui o arquivo já sai do tamanho certo, então usamos
 * <img> mesmo.
 */
/* eslint-disable @next/next/no-img-element */

import { Headphones, Info, RefreshCw } from "lucide-react";
import { Roboto } from "next/font/google";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { pickRandomSet, type CaptchaSet, type CaptchaTile } from "@/lib/captcha/sets";

import styles from "./narga-captcha.module.css";

const roboto = Roboto({
  weight: ["400", "500"],
  subsets: ["latin"],
  display: "swap",
  fallback: ["Arial", "Helvetica", "sans-serif"],
});

/** Quantos tiles cabem na grade; o resto do set são os extras da segunda rodada. */
const MAIN_TILES = 9;
const AUDIO_SRC = "/captcha/e-o-narga.mp3";
const AUDIO_OFF = "Desafio de áudio indisponível. Tenta na visão mesmo.";

type Status = "idle" | "loading" | "challenge" | "verifying" | "verified";

interface Slot {
  key: string;
  tile: CaptchaTile;
  fresh: boolean;
}

export interface NargaCaptchaProps {
  onVerified: () => void;
  /** "always" (padrão) mostra o widget e o desafio; "off" chama onVerified no mount e renderiza nada */
  mode?: "always" | "off";
  /** texto do logo; padrão "reNARGA" */
  brand?: string;
}

export function NargaCaptcha({
  onVerified,
  mode = "always",
  brand = "reNARGA",
}: NargaCaptchaProps) {
  const [status, setStatus] = useState<Status>("idle");
  const [set, setSet] = useState<CaptchaSet | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [audioMode, setAudioMode] = useState(false);
  const [answer, setAnswer] = useState("");
  const [tipOpen, setTipOpen] = useState(false);
  // "primeira vez" do PULAR vazio e a rodada extra valem por sessão do widget.
  const [emptyTries, setEmptyTries] = useState(0);
  const [extraUsed, setExtraUsed] = useState(false);

  const popupRef = useRef<HTMLDivElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const timers = useRef<number[]>([]);
  const nonce = useRef(0);
  // Muda quando o desafio é fechado/trocado: timers antigos param de valer.
  const gen = useRef(0);
  const onVerifiedRef = useRef(onVerified);

  const titleId = useId();
  const open = status === "challenge" || status === "verifying";

  useEffect(() => {
    onVerifiedRef.current = onVerified;
  }, [onVerified]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((id) => window.clearTimeout(id));
  }, []);

  // mode="off": nem widget, nem desafio. Passa direto.
  useEffect(() => {
    if (mode === "off") onVerifiedRef.current();
  }, [mode]);

  const later = useCallback((fn: () => void, ms: number) => {
    const mine = gen.current;
    const id = window.setTimeout(() => {
      if (gen.current === mine) fn();
    }, ms);
    timers.current.push(id);
  }, []);

  const loadSet = useCallback((next: CaptchaSet) => {
    nonce.current += 1;
    setSet(next);
    setSlots(
      next.tiles.slice(0, MAIN_TILES).map((tile, i) => ({
        key: `${next.id}-${i}-${nonce.current}`,
        tile,
        fresh: false,
      })),
    );
    setSelected([]);
    setError(null);
    setNotice(null);
    setInfo(null);
    setAnswer("");
    setAudioMode(false);
  }, []);

  const reset = useCallback(() => {
    gen.current += 1;
    setStatus("idle");
    setSet(null);
    setSlots([]);
    setSelected([]);
    setError(null);
    setNotice(null);
    setInfo(null);
    setAnswer("");
    setAudioMode(false);
    setTipOpen(false);
  }, []);

  // Foco preso no popup + Esc volta pra "não verificado".
  useEffect(() => {
    if (!open) return;
    const node = popupRef.current;
    if (!node) return;

    const focusables = () =>
      Array.from(
        node.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
        ),
      );

    focusables()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        reset();
        checkboxRef.current?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !node.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
    // `open` é o gatilho: não refocar a cada re-render do desafio.
  }, [open, reset]);

  function handleCheck() {
    if (status !== "idle") return;
    setStatus("loading");
    // O sorteio acontece no timer (nunca no render), senão dá erro de hidratação.
    later(
      () => {
        loadSet(pickRandomSet());
        setStatus("challenge");
      },
      800 + Math.floor(Math.random() * 700),
    );
  }

  function toggleTile(key: string) {
    setError(null);
    setSelected((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));
  }

  function handleReload() {
    if (!set) return;
    gen.current += 1;
    loadSet(pickRandomSet(set.id));
  }

  function handleAudio() {
    setInfo(null);
    setTipOpen(false);
    let done = false;
    const fail = () => {
      if (done) return;
      done = true;
      setAudioMode(false);
      setInfo(AUDIO_OFF);
    };
    try {
      const audio = new Audio(AUDIO_SRC);
      audio.addEventListener("error", fail);
      void audio
        .play()
        .then(() => {
          if (done) return;
          done = true;
          setAnswer("");
          setSelected([]);
          setAudioMode(true);
          setNotice(null);
          setError(null);
        })
        .catch(fail);
    } catch {
      fail();
    }
  }

  function succeed() {
    setStatus("verified");
    setError(null);
    setNotice(null);
    setInfo(null);
    setTipOpen(false);
    onVerifiedRef.current();
  }

  function replaceSelected(current: CaptchaSet) {
    const extras = current.tiles.slice(MAIN_TILES);
    nonce.current += 1;
    setSlots((cur) => {
      let taken = 0;
      return cur.map((slot) => {
        if (!selected.includes(slot.key)) return slot.fresh ? { ...slot, fresh: false } : slot;
        const tile = extras.length > 0 ? extras[taken % extras.length] : slot.tile;
        taken += 1;
        return { key: `${slot.key}-r${nonce.current}`, tile, fresh: true };
      });
    });
    setSelected([]);
  }

  function handleVerify() {
    if (!set || status !== "challenge") return;
    const picking = !audioMode && set.layout !== "text";

    if (picking && selected.length === 0 && emptyTries === 0) {
      // Primeira vez sem nada marcado: reclama e não deixa passar. Na segunda, passa.
      setEmptyTries(1);
      setNotice(null);
      setInfo(null);
      setError("Selecione todas as imagens correspondentes.");
      return;
    }

    setError(null);
    setInfo(null);
    setTipOpen(false);
    setStatus("verifying");
    later(() => {
      const extraRound = picking && selected.length > 0 && !extraUsed && Math.random() < 0.25;
      if (extraRound) {
        setExtraUsed(true);
        setStatus("challenge");
        setNotice("Selecione também as imagens restantes.");
        replaceSelected(set);
        return;
      }
      succeed();
    }, 600);
  }

  if (mode === "off") return null;

  const busy = status === "loading" || status === "verifying";
  const picking = set ? !audioMode && set.layout !== "text" : false;
  const skip = picking && selected.length === 0;

  return (
    <div className={`${roboto.className} ${styles.root}`}>
      <div className={styles.widget}>
        <label className={`${styles.check} ${status === "idle" ? "" : styles.checkBusy}`}>
          <span className={styles.boxWrap}>
            <input
              ref={checkboxRef}
              type="checkbox"
              className={styles.native}
              checked={status === "verified"}
              disabled={status !== "idle"}
              onChange={handleCheck}
            />
            <span
              className={`${styles.box} ${status === "loading" || status === "verified" ? styles.boxBare : ""}`}
              aria-hidden="true"
            >
              {status === "loading" ? <span className={styles.spinner} /> : null}
              {status === "verified" ? (
                <svg className={styles.checkIcon} viewBox="0 0 28 28">
                  <path d="M4 15l7 7L24 6" />
                </svg>
              ) : null}
            </span>
          </span>
          <span className={styles.label}>Não sou um robô</span>
        </label>

        <div className={styles.logo}>
          <img
            className={styles.logoImg}
            src="/icons/logo-face.png"
            alt=""
            width={32}
            height={32}
          />
          <span className={styles.brand}>{brand}</span>
          <span className={styles.legal}>
            <a href="/termos">Privacidade</a> · <a href="/termos">Termos</a>
          </span>
        </div>
      </div>

      {open && set ? (
        <div
          ref={popupRef}
          className={styles.popup}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className={styles.header} id={titleId}>
            {audioMode ? (
              <strong className={styles.headerKeyword}>Digite o que você ouviu</strong>
            ) : set.keyword ? (
              <>
                <span className={styles.headerPrompt}>{set.prompt}</span>
                <strong className={styles.headerKeyword}>{set.keyword}</strong>
              </>
            ) : (
              <strong className={styles.headerKeyword}>{set.prompt}</strong>
            )}
            {picking ? (
              <p className={styles.headerHint}>Se não houver nenhuma, clique em Pular</p>
            ) : null}
          </div>

          <div className={styles.body}>
            {audioMode ? (
              <>
                <div className={styles.audioBox}>
                  <Headphones className={styles.audioIcon} aria-hidden="true" />
                </div>
                <label className={styles.answerLabel} htmlFor={`${titleId}-answer`}>
                  Digite o que você ouviu
                </label>
                <input
                  id={`${titleId}-answer`}
                  className={styles.answer}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  autoComplete="off"
                />
              </>
            ) : set.layout === "text" ? (
              <>
                <img className={styles.textImage} src={set.tiles[0].src} alt={set.tiles[0].alt} />
                <label className={styles.answerLabel} htmlFor={`${titleId}-answer`}>
                  Digite o texto acima
                </label>
                <input
                  id={`${titleId}-answer`}
                  className={styles.answer}
                  value={answer}
                  onChange={(event) => setAnswer(event.target.value)}
                  autoComplete="off"
                />
              </>
            ) : (
              <div className={styles.grid}>
                {slots.map((slot) => {
                  const on = selected.includes(slot.key);
                  return (
                    <button
                      key={slot.key}
                      type="button"
                      className={`${styles.tile} ${slot.fresh ? styles.fresh : ""}`}
                      aria-pressed={on}
                      aria-label={slot.tile.alt}
                      onClick={() => toggleTile(slot.key)}
                    >
                      <img className={styles.tileImg} src={slot.tile.src} alt="" />
                      <span className={styles.badge} aria-hidden="true">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M4 12l6 6L20 6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {error ? (
            <p className={styles.error} role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className={styles.notice} role="status">
              {notice}
            </p>
          ) : null}
          {info ? (
            <p className={styles.info} role="status">
              {info}
            </p>
          ) : null}

          <div className={styles.footer}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={handleReload}
              title="Outro desafio"
              aria-label="Outro desafio"
            >
              <RefreshCw aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={handleAudio}
              title="Desafio de áudio"
              aria-label="Desafio de áudio"
            >
              <Headphones aria-hidden="true" />
            </button>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setTipOpen((v) => !v)}
              title={`Este site é protegido pelo ${brand}. Nenhum narguilé foi verificado.`}
              aria-label="Sobre este desafio"
              aria-expanded={tipOpen}
            >
              <Info aria-hidden="true" />
            </button>
            {tipOpen ? (
              <p className={styles.tooltip} role="status">
                Este site é protegido pelo {brand}. Nenhum narguilé foi verificado.
              </p>
            ) : null}
            <button type="button" className={styles.verify} onClick={handleVerify} disabled={busy}>
              {status === "verifying" ? (
                <span className={styles.btnSpinner} role="status" aria-label="Verificando" />
              ) : skip ? (
                "Pular"
              ) : (
                "Verificar"
              )}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default NargaCaptcha;
