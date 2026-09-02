/**
 * CSV mínimo, só o que o Google Takeout gera: aspas duplas, vírgula dentro de
 * aspas, `""` como aspa literal, CRLF ou LF e o BOM que o Excel adora.
 * Nada de dependência nova pra ler quatro colunas.
 */

/** Linhas × células, sem interpretar cabeçalho. */
export function parseCsv(text: string): string[][] {
  // BOM no começo entraria no primeiro cabeçalho e estragaria o casamento das colunas.
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  // Distingue "linha vazia no fim do arquivo" de "linha com um campo vazio".
  let started = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
      } else if (input[i + 1] === '"') {
        field += '"';
        i++;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
      started = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
      started = true;
    } else if (char === "\n") {
      // Linha totalmente em branco é só espaçamento no arquivo, não um registro.
      if (started || row.length > 0) {
        row.push(field);
        rows.push(row);
        row = [];
      }
      field = "";
      started = false;
    } else if (char !== "\r") {
      field += char;
      started = true;
    }
  }

  if (started || field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export interface TakeoutRow {
  title: string | null;
  url: string | null;
  note: string | null;
}

/** Cabeçalhos que a gente reconhece, em português e em inglês. */
const HEADER_ALIASES: Record<string, keyof TakeoutRow> = {
  title: "title",
  titulo: "title",
  nome: "title",
  name: "title",
  url: "url",
  link: "url",
  note: "note",
  nota: "note",
  comentario: "note",
  comentarios: "note",
};

/** "Título" → "titulo": minúsculo, sem acento, sem espaço nas pontas. */
function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

function cell(cells: string[], index: number | undefined): string | null {
  if (index === undefined) return null;
  const value = cells[index]?.trim();
  return value ? value : null;
}

function looksLikeUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

/** Sem cabeçalho reconhecível: primeira célula com http vira URL, a primeira sem vira nome. */
function looseRow(cells: string[]): TakeoutRow {
  const trimmed = cells.map((value) => value.trim()).filter(Boolean);
  return {
    title: trimmed.find((value) => !looksLikeUrl(value)) ?? null,
    url: trimmed.find(looksLikeUrl) ?? null,
    note: null,
  };
}

/**
 * Lista salva do Google Maps: `Title,Note,URL,Tags` (ou `Título,Nota,URL,...`).
 * Sem cabeçalho que dê pra reconhecer, cai no modo solto e lê linha a linha.
 */
export function parseTakeoutCsv(text: string): TakeoutRow[] {
  const rows = parseCsv(text).filter((cells) => cells.some((value) => value.trim() !== ""));
  if (rows.length === 0) return [];

  const columns: Partial<Record<keyof TakeoutRow, number>> = {};
  rows[0].forEach((name, index) => {
    const key = HEADER_ALIASES[normalizeHeader(name)];
    if (key && columns[key] === undefined) columns[key] = index;
  });

  if (columns.url === undefined) return rows.map(looseRow);

  return rows.slice(1).map((cells) => ({
    title: cell(cells, columns.title),
    url: cell(cells, columns.url),
    note: cell(cells, columns.note),
  }));
}
