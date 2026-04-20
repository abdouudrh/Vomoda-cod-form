import prisma from "../db.server";

export type MetaSettingsValues = {
  metaEnabled: boolean;
  metaPixelId: string;
  metaConversionsApiToken: string;
  metaTestEventCode: string;
};

type MetaSettingsRow = {
  shop: string;
  metaEnabled: boolean;
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

function normalizeValue(value: string | null | undefined) {
  return value?.trim() || "";
}

export async function getMetaSettingsByShop(shop: string) {
  const settings = (await prisma.metaSettings.findUnique({
    where: { shop },
    select: {
      shop: true,
      metaEnabled: true,
      metaPixelId: true,
      metaConversionsApiToken: true,
      metaTestEventCode: true,
    },
  })) as MetaSettingsRow | null;

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
  const normalized = {
    metaEnabled: values.metaEnabled,
    metaPixelId: normalizeValue(values.metaPixelId) || null,
    metaConversionsApiToken:
      normalizeValue(values.metaConversionsApiToken) || null,
    metaTestEventCode: normalizeValue(values.metaTestEventCode) || null,
  };

  await prisma.metaSettings.upsert({
    where: { shop },
    update: normalized,
    create: {
      shop,
      ...normalized,
    },
  });
}
