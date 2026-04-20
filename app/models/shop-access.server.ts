import prisma from "../db.server";

type SessionLike = {
  shop?: string | null;
  accessToken?: string | null;
};

function normalizeShop(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function normalizeToken(value: string | null | undefined) {
  return value?.trim() || "";
}

export async function getShopAccessTokenByShop(shop: string) {
  const normalizedShop = normalizeShop(shop);

  if (!normalizedShop) {
    return "";
  }

  const storedToken = normalizeToken(
    (
      await prisma.shopAccess.findUnique({
        where: { shop: normalizedShop },
        select: { accessToken: true },
      })
    )?.accessToken,
  );

  if (storedToken) {
    return storedToken;
  }

  const sessionToken = normalizeToken(
    (
      await prisma.session.findFirst({
        where: { shop: normalizedShop },
        orderBy: [{ isOnline: "asc" }],
        select: { accessToken: true },
      })
    )?.accessToken,
  );

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

  await prisma.shopAccess.upsert({
    where: { shop: normalizedShop },
    update: {
      accessToken: normalizedToken,
    },
    create: {
      shop: normalizedShop,
      accessToken: normalizedToken,
    },
  });
}

export async function syncShopAccessFromSession(session?: SessionLike | null) {
  const shop = normalizeShop(session?.shop);
  const accessToken = normalizeToken(session?.accessToken);

  if (!shop || !accessToken) {
    return;
  }

  await upsertShopAccessTokenForShop(shop, accessToken);
}
