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
  const row = (await prisma.shippingSettings.findUnique({
    where: { shop },
    select: {
      shop: true,
      feesJson: true,
    },
  })) as ShippingSettingsRow | null;

  return parseShippingFeesJson(row?.feesJson ?? null);
}

export async function upsertShippingSettingsForShop(
  shop: string,
  shippingFees: ShippingFeesMap,
) {
  const normalized = normalizeShippingFeesMap(
    shippingFees,
    cloneDefaultShippingFees(),
  );

  await prisma.shippingSettings.upsert({
    where: { shop },
    update: {
      feesJson: JSON.stringify(normalized),
    },
    create: {
      shop,
      feesJson: JSON.stringify(normalized),
    },
  });
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
