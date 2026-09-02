import { hash, verify } from "@node-rs/argon2";
import { randomInt } from "node:crypto";

/**
 * Argon2id com os parâmetros padrão do @node-rs/argon2 (m=19456, t=2, p=1),
 * que são os recomendados pela OWASP pra argon2id.
 */
export async function hashPassword(password: string): Promise<string> {
  return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
  try {
    return await verify(passwordHash, password);
  } catch {
    // Hash corrompido ou em formato desconhecido: trata como senha errada.
    return false;
  }
}

/**
 * Hash de uma senha aleatória descartada. Usado no login quando o email não existe,
 * pra que o tempo de resposta fique parecido com o de um email que existe
 * (senão dá pra enumerar usuários pelo relógio).
 */
export const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$8GtBcj0BCvT76/VP4wSxYA$Zk/TL0O6QBpIq63qJsiRogqkW+PFSc70Do8Ni/d8Dbg";

/** Palavras temáticas do Centro de Floripa, sem acento e sem hífen. */
export const TEMP_PASSWORD_WORDS = [
  "sebo",
  "narga",
  "praca",
  "role",
  "figueira",
  "mercado",
  "carvao",
  "rosh",
  "mangueira",
  "fumaca",
  "livro",
  "centro",
  "ilha",
  "ponte",
  "hercilio",
  "luz",
  "boteco",
  "pastel",
  "catedral",
  "ladeira",
  "trapiche",
  "alfandega",
  "miramar",
  "conselheiro",
  "tabaco",
  "brasa",
  "cachorro",
  "chopp",
  "sanduiche",
  "esquina",
  "bonde",
  "farol",
] as const;

/** Senha temporária no formato `sebo-narga-praca-42`: fácil de ditar, chata de adivinhar. */
export function generateTempPassword(): string {
  const pool = [...TEMP_PASSWORD_WORDS];
  const words: string[] = [];
  for (let i = 0; i < 3; i++) {
    const [word] = pool.splice(randomInt(pool.length), 1);
    words.push(word);
  }
  return `${words.join("-")}-${randomInt(10, 100)}`;
}

/** Senhas óbvias demais pra deixar passar. Comparação em lower-case. */
export const WEAK_PASSWORDS = [
  "12345678",
  "123456789",
  "1234567890",
  "senha123",
  "senha1234",
  "password",
  "password1",
  "password123",
  "eonarga",
  "eonarga1",
  "narga123",
  "narguile",
  "qwerty123",
  "qwertyui",
  "abc12345",
  "11111111",
  "00000000",
  "iloveyou",
  "admin123",
  "adminadmin",
  "florianopolis",
] as const;

export const MIN_PASSWORD_LENGTH = 8;

const weakSet = new Set<string>(WEAK_PASSWORDS);

/** True se a senha é curta demais ou está na lista curta de senhas óbvias. */
export function isWeakPassword(password: string): boolean {
  if (password.length < MIN_PASSWORD_LENGTH) return true;
  return weakSet.has(password.toLowerCase());
}
