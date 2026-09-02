import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

type PhotosModule = typeof import("./photos");
type ClientModule = typeof import("@/lib/db/client");
type SchemaModule = typeof import("@/lib/db/schema");

const ANA = { id: "u-ana", name: "Ana", role: "member" as const };
const BIA = { id: "u-bia", name: "Bia", role: "member" as const };
const CADU = { id: "u-cadu", name: "Cadu", role: "admin" as const };

const PLACE_ID = "place-1";
const OTHER_PLACE_ID = "place-2";

let queries: PhotosModule;
let db: ClientModule["db"];
let schema: SchemaModule;
let tmpDir: string;

beforeAll(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eonarga-q-photos-"));
  const file = path.join(tmpDir, "test.db").split(path.sep).join("/");
  process.env.DATABASE_URL = `file:${file}`;

  const { runMigrations } = await import("@/lib/db/migrate");
  await runMigrations();

  ({ db } = await import("@/lib/db/client"));
  schema = await import("@/lib/db/schema");
  queries = await import("./photos");

  await db.insert(schema.users).values(
    [ANA, BIA, CADU].map((u) => ({
      id: u.id,
      name: u.name,
      email: `${u.id}@example.com`,
      passwordHash: "x",
      role: u.role,
      avatarId: u.id === ANA.id ? "avatar-da-ana01" : null,
    })),
  );
  await db
    .insert(schema.categories)
    .values([{ id: "cat", name: "Bar", slug: "bar", emoji: "🍺", color: "#fff" }]);
  await db.insert(schema.places).values(
    [PLACE_ID, OTHER_PLACE_ID].map((id, i) => ({
      id,
      slug: `lugar-${i}`,
      name: `Lugar ${i}`,
      categoryId: "cat",
      lat: -27.6,
      lng: -48.55,
      createdBy: ANA.id,
    })),
  );

  await db.insert(schema.photos).values([
    {
      id: "foto-velha",
      placeId: PLACE_ID,
      uploadedBy: ANA.id,
      width: 800,
      height: 600,
      createdAt: "2026-08-01T10:00:00.000Z",
    },
    {
      id: "foto-nova",
      placeId: PLACE_ID,
      uploadedBy: BIA.id,
      width: 400,
      height: 400,
      createdAt: "2026-09-01T10:00:00.000Z",
    },
    {
      id: "foto-de-outro-lugar",
      placeId: OTHER_PLACE_ID,
      uploadedBy: ANA.id,
      width: 100,
      height: 100,
    },
  ]);
});

afterAll(() => {
  db.$client.close();
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // No Windows o arquivo às vezes segue travado por um instante.
  }
});

describe("listPhotosForPlace", () => {
  it("traz só as do lugar, da mais nova pra mais velha, com quem mandou e as URLs", async () => {
    const items = await queries.listPhotosForPlace(PLACE_ID, ANA);
    expect(items.map((p) => p.id)).toEqual(["foto-nova", "foto-velha"]);

    expect(items[1]).toMatchObject({
      url: "/api/uploads/foto-velha",
      thumbUrl: "/api/uploads/foto-velha?v=thumb",
      width: 800,
      height: 600,
      reviewId: null,
      uploadedBy: { id: ANA.id, name: "Ana", avatarId: "avatar-da-ana01" },
    });
  });

  it("só o dono e o admin podem apagar; de fora, ninguém", async () => {
    const asAna = await queries.listPhotosForPlace(PLACE_ID, ANA);
    expect(asAna.map((p) => p.canDelete)).toEqual([false, true]);

    const asBia = await queries.listPhotosForPlace(PLACE_ID, BIA);
    expect(asBia.map((p) => p.canDelete)).toEqual([true, false]);

    const asAdmin = await queries.listPhotosForPlace(PLACE_ID, CADU);
    expect(asAdmin.every((p) => p.canDelete)).toBe(true);

    const asPublic = await queries.listPhotosForPlace(PLACE_ID, null);
    expect(asPublic.some((p) => p.canDelete)).toBe(false);
  });
});

describe("countPhotosForPlace", () => {
  it("conta por lugar e devolve 0 pra lugar sem foto", async () => {
    expect(await queries.countPhotosForPlace(PLACE_ID)).toBe(2);
    expect(await queries.countPhotosForPlace(OTHER_PLACE_ID)).toBe(1);
    expect(await queries.countPhotosForPlace("nao-existe")).toBe(0);
  });
});
