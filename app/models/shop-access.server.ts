import prisma from "../db.server";

type ShopAccessRow = {
  shop: string;
  accessToken: string | null;
};

type SessionRow = {
  shop: string;
  accessToken: string | null;
};

type SessionLike = {
  shop?: string | null;
  accessToken?: string | null;
};

let ensureShopAccessTablePromise: Promise<void> | null = null;

function normalizeShop(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function normalizeToken(value: string | null | undefined) {
  return value?.trim() || "";
}

async function ensureShopAccessTable() {
  if (!ensureShopAccessTablePromise) {
    ensureShopAccessTablePromise = prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ShopAccess" (
          "shop" TEXT NOT NULL PRIMARY KEY,
          "accessToken" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      .then(() => undefined);
  }

  return ensureShopAccessTablePromise;
}

export async function getShopAccessTokenByShop(shop: string) {
  const normalizedShop = normalizeShop(shop);

  if (!normalizedShop) {
    return "";
  }

  await ensureShopAccessTable();

  const rows = await prisma.$queryRawUnsafe<ShopAccessRow[]>(
    `
      SELECT
        "shop",
        "accessToken"
      FROM "ShopAccess"
      WHERE "shop" = ?
      LIMIT 1
    `,
    normalizedShop,
  );

  const storedToken = normalizeToken(rows[0]?.accessToken);

  if (storedToken) {
    return storedToken;
  }

  const sessionRows = await prisma.$queryRawUnsafe<SessionRow[]>(
    `
      SELECT
        "shop",
        "accessToken"
      FROM "Session"
      WHERE lower("shop") = ?
      ORDER BY "isOnline" ASC, "id" ASC
      LIMIT 1
    `,
    normalizedShop,
  );

  const sessionToken = normalizeToken(sessionRows[0]?.accessToken);

  if (sessionToken) {
    await upsertShopAccessTokenForShop(normalizedShop, sessionToken);
  }

  return sessionToken;
}

export async function upsertShopAccessTokenForShop(
  shop: string,
  accessToken: string,
) {
  const normalizedShop = normalizeShop(shop);
  const normalizedToken = normalizeToken(accessToken);

  if (!normalizedShop || !normalizedToken) {
    return;
  }

  await ensureShopAccessTable();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "ShopAccess" (
        "shop",
        "accessToken",
        "createdAt",
        "updatedAt"
      )
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("shop") DO UPDATE SET
        "accessToken" = excluded."accessToken",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    normalizedShop,
    normalizedToken,
  );
}

export async function syncShopAccessFromSession(session?: SessionLike | null) {
  const shop = normalizeShop(session?.shop);
  const accessToken = normalizeToken(session?.accessToken);

  if (!shop || !accessToken) {
    return;
  }

  await upsertShopAccessTokenForShop(shop, accessToken);
}
