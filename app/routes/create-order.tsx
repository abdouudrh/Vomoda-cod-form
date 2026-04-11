import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getMetaSettingsByShop } from "../models/meta-settings.server";
import { sendMetaPurchaseEvent } from "../services/meta.server";
import {
  getWilayaData,
  getWilayaName,
  isCommuneInWilaya,
  normalizeAlgeriaLocationName,
} from "../data/algeria-locations";
import { apiVersion, authenticate } from "../shopify.server";

type CodCustomer = {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  wilaya?: string;
};

type CodItem = {
  variant_id: number | string;
  quantity: number;
  product_id?: number | string;
  price?: number;
  title?: string;
  sku?: string;
};

type CodShipping = {
  method?: string;
};

type CodTracking = {
  eventId?: string;
  fbp?: string;
  fbc?: string;
  fbclid?: string;
  eventSourceUrl?: string;
  referrer?: string;
  userAgent?: string;
  language?: string;
  currency?: string;
  subtotal?: number;
  shippingPrice?: number;
  totalValue?: number;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  utmTerm?: string;
};

type CodRequestBody = {
  customer?: CodCustomer;
  note?: string;
  shipping?: CodShipping;
  items?: CodItem[];
  tracking?: CodTracking;
};

type OrderCreateGraphQLError = {
  message?: string;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
  };
};

type OrderCreateUserError = {
  field?: string[];
  message: string;
};

type OrderCreateResponse = {
  data?: {
    orderCreate?: {
      order?: {
        id?: string | null;
        name?: string | null;
      } | null;
      userErrors?: OrderCreateUserError[];
    } | null;
  } | null;
  errors?: OrderCreateGraphQLError[];
};

type OfflineSessionLike = {
  shop?: string;
  accessToken?: string;
};

const SHIPPING_PRICES_DA: Record<string, number> = {
  adrar: 650,
  chlef: 320,
  laghouat: 580,
  "oum el bouaghi": 430,
  batna: 470,
  bejaia: 360,
  biskra: 520,
  bechar: 740,
  blida: 240,
  bouira: 310,
  tamanrasset: 800,
  tebessa: 560,
  tlemcen: 420,
  tiaret: 450,
  "tizi ouzou": 280,
  alger: 200,
  djelfa: 500,
  jijel: 340,
  setif: 390,
  saida: 460,
  skikda: 350,
  "sidi bel abbes": 410,
  annaba: 370,
  guelma: 440,
  constantine: 380,
  medea: 330,
  mostaganem: 360,
  "m sila": 490,
  mascara: 430,
  ouargla: 610,
  oran: 300,
  "el bayadh": 570,
  illizi: 780,
  "bordj bou arreridj": 400,
  boumerdes: 260,
  "el tarf": 390,
  tindouf: 790,
  tissemsilt: 440,
  "el oued": 540,
  khenchela: 500,
  "souk ahras": 460,
  tipaza: 230,
  mila: 410,
  "ain defla": 340,
  naama: 620,
  "ain temouchent": 380,
  ghardaia: 590,
  relizane: 350,
  timimoun: 680,
  "bordj badji mokhtar": 760,
  "ouled djellal": 470,
  "beni abbes": 620,
  "in salah": 710,
  "in guezzam": 790,
  touggourt: 530,
  djanet: 750,
  "el meghaier": 480,
  "el menia": 640,
};

function codJson(payload: Record<string, unknown>) {
  return json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

async function parseCodRequest(request: Request): Promise<CodRequestBody> {
  const rawBody = await request.text();

  if (!rawBody) {
    return {};
  }

  try {
    return JSON.parse(rawBody) as CodRequestBody;
  } catch (error) {
    console.error("COD invalid request body:", {
      contentType: request.headers.get("content-type"),
      rawBody,
      error,
    });
    throw new Error("INVALID_REQUEST_BODY");
  }
}

function getShippingPriceForWilaya(wilaya?: string) {
  const key = normalizeAlgeriaLocationName(wilaya);
  return key ? SHIPPING_PRICES_DA[key] ?? null : null;
}

function getShippingOptionsForWilaya(wilaya?: string) {
  const home = getShippingPriceForWilaya(wilaya);

  if (home === null) {
    return null;
  }

  return {
    home,
    stopDesk: Math.max(home - 100, 0),
  };
}

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function truncateValue(value: string, maxLength = 255) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function getNumberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function toOptionalUrl(value: unknown) {
  const trimmed = getTrimmedString(value);

  if (!trimmed) {
    return "";
  }

  try {
    return new URL(trimmed).toString();
  } catch {
    return "";
  }
}

function getClientIpAddress(request: Request) {
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-forwarded-for"),
    request.headers.get("x-real-ip"),
    request.headers.get("true-client-ip"),
    request.headers.get("fly-client-ip"),
    request.headers.get("x-client-ip"),
  ];

  for (const candidate of candidates) {
    const value = getTrimmedString(candidate);
    if (!value) continue;

    const first = value.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  return "";
}

function isProtectedOrderReadError(error: OrderCreateGraphQLError) {
  if (error.extensions?.code !== "ACCESS_DENIED") {
    return false;
  }

  const path = error.path ?? [];
  return path[0] === "orderCreate" && path[1] === "order";
}

function buildOrderCustomAttributes(
  request: Request,
  tracking: CodTracking,
) {
  const attributes = [
    {
      key: "meta_client_ip_address",
      value: truncateValue(getClientIpAddress(request), 64),
    },
    {
      key: "meta_client_user_agent",
      value: truncateValue(
        getTrimmedString(request.headers.get("user-agent")) ||
          getTrimmedString(tracking.userAgent),
        255,
      ),
    },
    {
      key: "meta_event_id",
      value: truncateValue(getTrimmedString(tracking.eventId), 128),
    },
    {
      key: "meta_fbp",
      value: truncateValue(getTrimmedString(tracking.fbp), 255),
    },
    {
      key: "meta_fbc",
      value: truncateValue(getTrimmedString(tracking.fbc), 255),
    },
    {
      key: "meta_fbclid",
      value: truncateValue(getTrimmedString(tracking.fbclid), 255),
    },
    {
      key: "meta_event_source_url",
      value: truncateValue(toOptionalUrl(tracking.eventSourceUrl), 500),
    },
    {
      key: "meta_referrer",
      value: truncateValue(
        toOptionalUrl(tracking.referrer) ||
          toOptionalUrl(request.headers.get("referer")),
        500,
      ),
    },
    {
      key: "meta_browser_language",
      value: truncateValue(getTrimmedString(tracking.language), 64),
    },
    {
      key: "meta_utm_source",
      value: truncateValue(getTrimmedString(tracking.utmSource), 255),
    },
    {
      key: "meta_utm_medium",
      value: truncateValue(getTrimmedString(tracking.utmMedium), 255),
    },
    {
      key: "meta_utm_campaign",
      value: truncateValue(getTrimmedString(tracking.utmCampaign), 255),
    },
    {
      key: "meta_utm_content",
      value: truncateValue(getTrimmedString(tracking.utmContent), 255),
    },
    {
      key: "meta_utm_term",
      value: truncateValue(getTrimmedString(tracking.utmTerm), 255),
    },
  ];

  return attributes.filter(
    (attribute): attribute is { key: string; value: string } =>
      Boolean(attribute.value),
  );
}

async function callAdminGraphQL(
  session: OfflineSessionLike,
  query: string,
  variables: Record<string, unknown>,
): Promise<OrderCreateResponse> {
  if (!session.shop || !session.accessToken) {
    throw new Error("MISSING_OFFLINE_SESSION");
  }

  const endpoint = `https://${session.shop}/admin/api/${apiVersion}/graphql.json`;

  let response: Response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Shopify-Access-Token": session.accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error) {
    console.error("COD Admin API fetch failed:", {
      endpoint,
      shop: session.shop,
      error,
    });
    throw new Error(
      error instanceof Error ? error.message : "ADMIN_API_FETCH_FAILED",
    );
  }

  const raw = await response.text();

  if (!response.ok) {
    console.error("COD Admin API non-OK response:", {
      endpoint,
      status: response.status,
      statusText: response.statusText,
      body: raw,
    });
    throw new Error(
      `ADMIN_API_${response.status}_${response.statusText || "ERROR"}`,
    );
  }

  try {
    return (raw ? JSON.parse(raw) : {}) as OrderCreateResponse;
  } catch (error) {
    console.error("COD Admin API invalid JSON:", {
      endpoint,
      body: raw,
      error,
    });
    throw new Error("INVALID_ADMIN_API_RESPONSE");
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    console.log("COD ROUTE HIT");

    const { session } = await authenticate.public.appProxy(request);

    if (!session?.shop || !session.accessToken) {
      return codJson({
        success: false,
        code: "APP_PROXY_UNAUTHENTICATED",
        error: "App proxy non authentifie",
      });
    }

    const body = await parseCodRequest(request);
    const customer = body.customer || {};
    const customerNote = getTrimmedString(body.note);
    const customerWilaya =
      typeof customer.wilaya === "string" ? customer.wilaya.trim() : "";
    const customerCity =
      typeof customer.city === "string" ? customer.city.trim() : "";
    const wilayaName = getWilayaName(customerWilaya);
    const wilayaData = getWilayaData(customerWilaya);
    const items = Array.isArray(body.items) ? body.items : [];
    const tracking = body.tracking || {};
    const shippingOptions = getShippingOptionsForWilaya(wilayaName || undefined);
    const shippingMethod = body.shipping?.method === "stop_desk" ? "stop_desk" : "home";

    if (!items.length) {
      return codJson({
        success: false,
        code: "EMPTY_CART",
        error: "Panier vide",
      });
    }

    if (!wilayaName || !wilayaData || shippingOptions === null) {
      return codJson({
        success: false,
        code: "UNKNOWN_WILAYA_SHIPPING",
        error: "Wilaya de livraison invalide",
      });
    }

    if (!customerCity || !isCommuneInWilaya(wilayaName, customerCity)) {
      return codJson({
        success: false,
        code: "UNKNOWN_CITY_FOR_WILAYA",
        error: "Commune de livraison invalide pour cette wilaya",
      });
    }

    const shippingTitle =
      shippingMethod === "stop_desk" ? "Stop desk" : "Livraison a domicile";
    const shippingPrice =
      shippingMethod === "stop_desk"
        ? shippingOptions.stopDesk
        : shippingOptions.home;

    const lineItems = items.map((item) => ({
      variantId: `gid://shopify/ProductVariant/${item.variant_id}`,
      quantity: Number(item.quantity) || 1,
    }));

    const mutation = `#graphql
      mutation orderCreate($order: OrderCreateOrderInput!, $options: OrderCreateOptionsInput) {
        orderCreate(order: $order, options: $options) {
          order {
            id
            name
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const variables = {
      order: {
        lineItems,
        financialStatus: "PENDING",
        tags: ["COD", "Custom COD Form"],
        note: customerNote || "Commande COD creee via formulaire personnalise",
        customAttributes: buildOrderCustomAttributes(request, tracking),
        ...(customer.email ? { email: customer.email } : {}),
        shippingLines: [
          {
            title: `${shippingTitle} - ${wilayaName}`,
            priceSet: {
              shopMoney: {
                amount: shippingPrice.toFixed(2),
                currencyCode: "DZD",
              },
            },
          },
        ],
        shippingAddress: {
          firstName: customer.firstName || "",
          lastName: customer.lastName || "",
          address1: customer.address || "",
          city: customerCity,
          province: wilayaName,
          zip: wilayaData.zip,
          countryCode: "DZ",
          phone: customer.phone || "",
        },
      },
      options: {
        sendReceipt: false,
        sendFulfillmentReceipt: false,
      },
    };

    const result = await callAdminGraphQL(session, mutation, variables);

    console.log("ORDER CREATE RESULT:", JSON.stringify(result, null, 2));

    const payload = result.data?.orderCreate;
    const createdOrder = payload?.order ?? null;
    const errors = payload?.userErrors ?? [];
    const graphQLErrors = result.errors ?? [];
    const blockingGraphQLErrors = graphQLErrors.filter(
      (error) => !isProtectedOrderReadError(error),
    );

    if (!payload) {
      return codJson({
        success: false,
        code: "ORDER_CREATE_NO_PAYLOAD",
        error: "Aucune reponse de creation de commande",
        details: result,
      });
    }

    if (blockingGraphQLErrors.length) {
      return codJson({
        success: false,
        code: "GRAPHQL_ERROR",
        error: blockingGraphQLErrors
          .map((e) => e.message || "Erreur GraphQL")
          .join(" | "),
        details: blockingGraphQLErrors,
      });
    }

    if (errors.length) {
      return codJson({
        success: false,
        code: "ORDER_CREATE_USER_ERROR",
        error: errors.map((e) => e.message).join(" | "),
        details: errors,
      });
    }

    try {
      const metaSettings = await getMetaSettingsByShop(session.shop);

      if (
        metaSettings.metaEnabled &&
        metaSettings.metaPixelId &&
        metaSettings.metaConversionsApiToken
      ) {
        await sendMetaPurchaseEvent({
          pixelId: metaSettings.metaPixelId,
          accessToken: metaSettings.metaConversionsApiToken,
          testEventCode: metaSettings.metaTestEventCode,
          shop: session.shop,
          customer: {
            email: customer.email || "",
            phone: customer.phone || "",
            firstName: customer.firstName || "",
            lastName: customer.lastName || "",
            city: customerCity,
            province: wilayaName,
            zip: wilayaData.zip,
            country: "DZ",
          },
          items: items.map((item) => ({
            variantId: item.variant_id,
            productId: item.product_id,
            quantity: Number(item.quantity) || 1,
            price: getNumberValue(item.price) ?? undefined,
            title: typeof item.title === "string" ? item.title : undefined,
            sku: typeof item.sku === "string" ? item.sku : undefined,
          })),
          tracking: {
            eventId: tracking.eventId,
            fbp: tracking.fbp,
            fbc: tracking.fbc,
            eventSourceUrl: tracking.eventSourceUrl,
            clientIpAddress: getClientIpAddress(request),
            clientUserAgent:
              getTrimmedString(request.headers.get("user-agent")) ||
              getTrimmedString(tracking.userAgent),
            currency: getTrimmedString(tracking.currency) || "DZD",
            subtotal: getNumberValue(tracking.subtotal) ?? undefined,
            shippingPrice:
              getNumberValue(tracking.shippingPrice) ?? shippingPrice,
            totalValue: getNumberValue(tracking.totalValue) ?? undefined,
          },
        });
      }
    } catch (metaError) {
      console.error("COD Meta Purchase event error:", metaError);
    }

    return codJson({
      success: true,
      orderId: createdOrder?.id ?? "",
      orderName: createdOrder?.name ?? "",
    });
  } catch (error) {
    console.error("COD create-order error:", error);

    const message =
      error instanceof Error ? error.message : "UNKNOWN_CREATE_ORDER_ERROR";

    return codJson({
      success: false,
      code: message,
      error: "Erreur serveur lors de la creation de la commande",
    });
  }
}
