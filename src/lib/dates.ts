import { formatDistance, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

/**
 * Datas das avaliações. O fuso é fixo porque o grupo é de Floripa e a data da visita
 * é "só data": deixar o servidor (UTC) decidir viraria "amanhã" depois das 21h.
 */
export const APP_TIME_ZONE = "America/Sao_Paulo";

/** Hoje em `YYYY-MM-DD` no fuso do app. Vai do servidor pro form pra não dar hidratação torta. */
export function todayISODate(now: Date = new Date(), timeZone: string = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * "há 2 dias", "há cerca de 1 hora". `now` é parâmetro pra dar pra testar; só o
 * servidor chama isso (o cliente re-renderizaria com outro relógio).
 */
export function relativeFromNow(iso: string, now: Date = new Date()): string {
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) return "";
  return formatDistance(date, now, { addSuffix: true, locale: ptBR });
}

/** "2026-08-12" → "12/08". `parseISO` de propósito: `new Date` leria como UTC e voltaria um dia. */
export function formatDayMonth(isoDate: string): string {
  const date = parseISO(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}
