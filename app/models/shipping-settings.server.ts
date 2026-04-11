import prisma from "../db.server";
import {
  type AlgeriaWilayaName,
  getWilayaName,
} from "../data/algeria-locations";
import {
  cloneDefaultShippingFees,
  normalizeShippingFeesMap,
  type ShippingFeesMap,
} from "../data/default-shipping-fees";

type ShippingSettingsRow = {
  shop: string;
  feesJson: string | null;
};

export type ShippingOption = {
  id: "home" | "stop_desk";
  label: string;
  price: number;
};

let ensureShippingSettingsTablePromise: Promise<void> | null = null;

async function ensureShippingSettingsTable() {
  if (!ensureShippingSettingsTablePromise) {
    ensureShippingSettingsTablePromise = prisma
      .$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS "ShippingSettings" (
          "shop" TEXT NOT NULL PRIMARY KEY,
          "feesJson" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `)
      .then(() => undefined);
  }

  return ensureShippingSettingsTablePromise;
}

function parseShippingFeesJson(raw: string | null) {
  if (!raw) {
    return cloneDefaultShippingFees();
  }

  try {
    return normalizeShippingFeesMap(JSON.parse(raw), cloneDefaultShippingFees());
  } catch (error) {
    console.error("Invalid shipping settings JSON:", error);
    return cloneDefaultShippingFees();
  }
}

export async function getShippingSettingsByShop(shop: string) {
  await ensureShippingSettingsTable();

  const rows = await prisma.$queryRawUnsafe<ShippingSettingsRow[]>(
    `
      SELECT
        "shop",
        "feesJson"
      FROM "ShippingSettings"
      WHERE "shop" = ?
      LIMIT 1
    `,
    shop,
  );

  return parseShippingFeesJson(rows[0]?.feesJson ?? null);
}

export async function upsertShippingSettingsForShop(
  shop: string,
  shippingFees: ShippingFeesMap,
) {
  await ensureShippingSettingsTable();

  const normalized = normalizeShippingFeesMap(
    shippingFees,
    cloneDefaultShippingFees(),
  );

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO "ShippingSettings" (
        "shop",
        "feesJson",
        "createdAt",
        "updatedAt"
      )
      VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT("shop") DO UPDATE SET
        "feesJson" = excluded."feesJson",
        "updatedAt" = CURRENT_TIMESTAMP
    `,
    shop,
    JSON.stringify(normalized),
  );
}

function getShippingFeesForWilaya(
  shippingFees: ShippingFeesMap,
  wilaya?: string,
) {
  const wilayaName = getWilayaName(wilaya);

  if (!wilayaName) {
    return null;
  }

  return {
    wilayaName,
    fees: shippingFees[wilayaName],
  };
}

export function getShippingOptionsForWilaya(
  shippingFees: ShippingFeesMap,
  wilaya?: string,
): ShippingOption[] {
  const match = getShippingFeesForWilaya(shippingFees, wilaya);

  if (!match?.fees) {
    return [];
  }

  const options: ShippingOption[] = [];

  if (typeof match.fees.home === "number") {
    options.push({
      id: "home",
      label: "Livraison a domicile",
      price: match.fees.home,
    });
  }

  if (typeof match.fees.stopDesk === "number") {
    options.push({
      id: "stop_desk",
      label: "Stop desk",
      price: match.fees.stopDesk,
    });
  }

  return options;
}

export function getShippingFeeValueForWilaya(
  shippingFees: ShippingFeesMap,
  wilaya?: string,
) {
  const match = getShippingFeesForWilaya(shippingFees, wilaya);

  if (!match) {
    return {
      wilayaName: null,
      home: null,
      stopDesk: null,
    };
  }

  return {
    wilayaName: match.wilayaName as AlgeriaWilayaName,
    home: match.fees?.home ?? null,
    stopDesk: match.fees?.stopDesk ?? null,
  };
}
