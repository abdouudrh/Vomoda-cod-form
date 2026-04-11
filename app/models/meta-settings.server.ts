import prisma from "../db.server";

export type MetaSettingsValues = {
  metaEnabled: boolean;
  metaPixelId: string;
  metaConversionsApiToken: string;
  metaTestEventCode: string;
};

type MetaSettingsRow = {
  shop: string;
  metaEnabled: number | boolean;
  metaPixelId: string | null;
  metaConversionsApiToken: string | null;
  metaTestEventCode: string | null;
};

export const DEFAULT_META_SETTINGS: MetaSettingsValues = {
  metaEnabled: false,
  metaPixelId: "",
  metaConversionsApiToken: "",
  metaTestEventCode: "",
};

let ensureMetaSettingsTablePromise: Promise<void> | null = null;

function normalizeValue(value: string | null | undefined) {
  return value?.trim() || "";
}

async function ensureMetaSettingsTable() {
  if (!ensureMetaSettingsTablePromise) {
    ensureMetaSettingsTablePromise = prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "MetaSettings" (
        "shop" TEXT NOT NULL PRIMARY KEY,
        "metaEnabled" BOOLEAN NOT NULL DEFAULT false,
        "metaPixelId" TEXT,
        "metaConversionsApiToken" TEXT,
        "metaTestEventCode" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `).then(() => undefined);
  }

  return ensureMetaSettingsTablePromise;
}

export async function getMetaSettingsByShop(shop: string) {
  await ensureMetaSettingsTable();

  const rows = await prisma.$queryRawUnsafe<MetaSettingsRow[]>(
    `
      SELECT
        "shop",
        "metaEnabled",
        "metaPixelId",
        "metaConversionsApiToken",
        "metaTestEventCode"
      FROM "MetaSettings"
      WHERE "shop" = ?
      LIMIT 1
    `,
    shop,
  );

  const settings = rows[0];

  if (!settings) {
    return DEFAULT_META_SETTINGS;
  }

  return {
    metaEnabled: Boolean(settings.metaEnabled),
    metaPixelId: normalizeValue(settings.metaPixelId),
    metaConversionsApiToken: normalizeValue(settings.metaConversionsApiToken),
    metaTestEventCode: normalizeValue(settings.metaTestEventCode),
  };
}

export async function upsertMetaSettingsForShop(
  shop: string,
  values: MetaSettingsValues,
) {
  await ensureMetaSettingsTable();

  const normalized = {
    metaEnabled: values.metaEnabled ? 1 : 0,
    metaPixelId: normalizeValue(values.metaPixelId) || null,
    metaConversionsApiToken:
      normalizeValue(values.metaConversionsApiToken) || null,
    metaTestEventCode: normalizeValue(values.metaTestEventCode) || null,
  };

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "MetaSettings" (
        "shop",
        "metaEnabled",
        "metaPixelId",
        "metaConversionsApiToken",
        "metaTestEventCode",
        "createdAt",
        "updatedAt"
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("shop") DO UPDATE SET
        "metaEnabled" = excluded."metaEnabled",
        "metaPixelId" = excluded."metaPixelId",
        "metaConversionsApiToken" = excluded."metaConversionsApiToken",
        "metaTestEventCode" = excluded."metaTestEventCode",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    shop,
    normalized.metaEnabled,
    normalized.metaPixelId,
    normalized.metaConversionsApiToken,
    normalized.metaTestEventCode,
  );
}
