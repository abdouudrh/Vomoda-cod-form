import { createHash } from "node:crypto";

type MetaPurchaseCustomer = {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  city?: string;
  province?: string;
  zip?: string;
  country?: string;
};

type MetaPurchaseItem = {
  variantId: number | string;
  productId?: number | string;
  quantity: number;
  price?: number;
  title?: string;
  sku?: string;
};

type MetaPurchaseTracking = {
  eventId?: string;
  fbp?: string;
  fbc?: string;
  eventSourceUrl?: string;
  clientIpAddress?: string;
  clientUserAgent?: string;
  currency?: string;
  subtotal?: number;
  shippingPrice?: number;
  totalValue?: number;
};

type SendMetaPurchaseEventInput = {
  pixelId: string;
  accessToken: string;
  testEventCode?: string;
  orderId?: string;
  orderName?: string;
  shop: string;
  customer: MetaPurchaseCustomer;
  items: MetaPurchaseItem[];
  tracking: MetaPurchaseTracking;
};

function normalizeString(value: string | undefined) {
  return value?.trim() || "";
}

function stripAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeEmail(value: string | undefined) {
  return normalizeString(value).toLowerCase();
}

function normalizePhone(value: string | undefined) {
  let digits = normalizeString(value).replace(/\D+/g, "");
  if (!digits) return "";

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("213")) {
    return digits;
  }

  if (digits.startsWith("0")) {
    return `213${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `213${digits}`;
  }

  return digits;
}

function normalizeName(value: string | undefined) {
  return stripAccents(normalizeString(value)).toLowerCase();
}

function normalizeCityOrProvince(value: string | undefined) {
  return stripAccents(normalizeString(value)).toLowerCase();
}

function normalizeZip(value: string | undefined) {
  return normalizeString(value).replace(/\s+/g, "").toLowerCase();
}

function normalizeCountry(value: string | undefined) {
  return normalizeString(value).toLowerCase();
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function maybeHash(value: string) {
  return value ? [sha256(value)] : undefined;
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function buildExternalId(shop: string, customer: MetaPurchaseCustomer) {
  const normalizedEmail = normalizeEmail(customer.email);
  const normalizedPhone = normalizePhone(customer.phone);
  const seed = normalizedEmail || normalizedPhone;

  return seed ? `${shop}:${seed}` : "";
}

export async function sendMetaPurchaseEvent(input: SendMetaPurchaseEventInput) {
  const pixelId = normalizeString(input.pixelId);
  const accessToken = normalizeString(input.accessToken);
  const eventId = normalizeString(input.tracking.eventId);
  const orderReference = normalizeString(input.orderName || input.orderId || eventId);

  if (!pixelId || !accessToken || !eventId) {
    return { skipped: true };
  }

  const customer = input.customer;
  const items = input.items.filter((item) => Number(item.quantity) > 0);

  const subtotal =
    typeof input.tracking.subtotal === "number"
      ? input.tracking.subtotal
      : items.reduce(
          (sum, item) => sum + (Number(item.price) || 0) * (Number(item.quantity) || 0),
          0,
        );

  const shippingPrice =
    typeof input.tracking.shippingPrice === "number"
      ? input.tracking.shippingPrice
      : 0;

  const totalValue =
    typeof input.tracking.totalValue === "number"
      ? input.tracking.totalValue
      : subtotal + shippingPrice;

  const contents = items.map((item) => ({
    id: String(item.productId || item.variantId),
    quantity: Number(item.quantity) || 1,
    ...(typeof item.price === "number" ? { item_price: roundMoney(item.price) } : {}),
  }));

  const userData: Record<string, unknown> = {
    client_ip_address: normalizeString(input.tracking.clientIpAddress),
    client_user_agent: normalizeString(input.tracking.clientUserAgent),
    fbp: normalizeString(input.tracking.fbp),
    fbc: normalizeString(input.tracking.fbc),
    em: maybeHash(normalizeEmail(customer.email)),
    ph: maybeHash(normalizePhone(customer.phone)),
    fn: maybeHash(normalizeName(customer.firstName)),
    ln: maybeHash(normalizeName(customer.lastName)),
    ct: maybeHash(normalizeCityOrProvince(customer.city)),
    st: maybeHash(normalizeCityOrProvince(customer.province)),
    zp: maybeHash(normalizeZip(customer.zip)),
    country: maybeHash(normalizeCountry(customer.country || "DZ")),
    external_id: maybeHash(buildExternalId(input.shop, customer)),
  };

  Object.keys(userData).forEach((key) => {
    const value = userData[key];
    if (
      value === "" ||
      value === undefined ||
      value === null ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete userData[key];
    }
  });

  const payload = {
    data: [
      {
        event_name: "Purchase",
        event_time: Math.floor(Date.now() / 1000),
        event_id: eventId,
        action_source: "website",
        event_source_url: normalizeString(input.tracking.eventSourceUrl),
        user_data: userData,
        custom_data: {
          currency: normalizeString(input.tracking.currency || "DZD") || "DZD",
          value: roundMoney(totalValue),
          content_type: "product",
          contents,
          content_ids: contents.map((content) => content.id),
          num_items: items.reduce(
            (sum, item) => sum + (Number(item.quantity) || 0),
            0,
          ),
          order_id: orderReference,
        },
      },
    ],
    ...(normalizeString(input.testEventCode)
      ? { test_event_code: normalizeString(input.testEventCode) }
      : {}),
  };

  const endpoint = new URL(`https://graph.facebook.com/v22.0/${pixelId}/events`);
  endpoint.searchParams.set("access_token", accessToken);

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.error) {
    throw new Error(
      result?.error?.message ||
        `META_CAPI_${response.status}_${response.statusText || "ERROR"}`,
    );
  }

  return result;
}
