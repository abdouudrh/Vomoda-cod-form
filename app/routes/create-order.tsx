import { json, type ActionFunctionArgs } from "@remix-run/node";
import { getMetaSettingsByShop } from "../models/meta-settings.server";
import { getShopAccessTokenByShop } from "../models/shop-access.server";
import {
  getShippingOptionsForWilaya,
  getShippingSettingsByShop,
} from "../models/shipping-settings.server";
import { sendMetaPurchaseEvent } from "../services/meta.server";
import {
  getWilayaData,
  getWilayaName,
  isCommuneInWilaya,
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

type AdminGraphQLError = {
  message?: string;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
  };
};

type AdminGraphQLUserError = {
  field?: string[];
  message: string;
};

type AdminGraphQLResponse = {
  errors?: AdminGraphQLError[];
};

type DraftOrderCreateResponse = AdminGraphQLResponse & {
  data?: {
    draftOrderCreate?: {
      draftOrder?: {
        id?: string | null;
      } | null;
      userErrors?: AdminGraphQLUserError[];
    } | null;
  } | null;
};

type DraftOrderCompleteResponse = AdminGraphQLResponse & {
  data?: {
    draftOrderComplete?: {
      draftOrder?: {
        id?: string | null;
        order?: {
          id?: string | null;
          name?: string | null;
        } | null;
      } | null;
      userErrors?: AdminGraphQLUserError[];
    } | null;
  } | null;
};

type MetafieldsSetResponse = AdminGraphQLResponse & {
  data?: {
    metafieldsSet?: {
      metafields?: Array<{
        id?: string | null;
        key?: string | null;
        namespace?: string | null;
      }> | null;
      userErrors?: AdminGraphQLUserError[];
    } | null;
  } | null;
};

type CustomerSetResponse = AdminGraphQLResponse & {
  data?: {
    customerSet?: {
      customer?: {
        id?: string | null;
      } | null;
      userErrors?: AdminGraphQLUserError[];
    } | null;
  } | null;
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

function getTrimmedString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeShop(value: unknown) {
  return getTrimmedString(value).toLowerCase();
}

function truncateValue(value: string, maxLength = 255) {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

function normalizeAlgeriaPhoneNumber(value: unknown) {
  const raw = getTrimmedString(value);

  if (!raw) {
    return "";
  }

  const digits = raw.replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.startsWith("00")) {
    return `+${digits.slice(2)}`;
  }

  if (digits.startsWith("213")) {
    return `+${digits}`;
  }

  if (digits.startsWith("0")) {
    return `+213${digits.slice(1)}`;
  }

  if (digits.length === 9) {
    return `+213${digits}`;
  }

  return raw.startsWith("+") ? `+${digits}` : digits;
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

function isProtectedOrderReadError(error: AdminGraphQLError) {
  if (error.extensions?.code !== "ACCESS_DENIED") {
    return false;
  }

  const path = error.path ?? [];
  return (
    (path[0] === "orderCreate" && path[1] === "order") ||
    (path[0] === "draftOrderComplete" &&
      path[1] === "draftOrder" &&
      path[2] === "order")
  );
}

function buildVisibleOrderAttributes({
  request,
  tracking,
  customer,
  customerCity,
  normalizedPhone,
  shippingTitle,
  wilayaName,
  wilayaCode,
}: {
  request: Request;
  tracking: CodTracking;
  customer: CodCustomer;
  customerCity: string;
  normalizedPhone: string;
  shippingTitle: string;
  wilayaName: string;
  wilayaCode: number | string;
}) {
  const fullUrl =
    toOptionalUrl(tracking.eventSourceUrl) ||
    toOptionalUrl(request.headers.get("referer"));

  const attributes = [
    {
      key: "Commune",
      value: truncateValue(customerCity, 255),
    },
    {
      key: "full_url",
      value: truncateValue(fullUrl, 500),
    },
    {
      key: "App",
      value: "Vomoda COD Form",
    },
    {
      key: "Delivery",
      value: truncateValue(shippingTitle, 255),
    },
    {
      key: "IP Address",
      value: truncateValue(getClientIpAddress(request), 64),
    },
    {
      key: "Accepts Marketing",
      value: "Yes",
    },
    {
      key: "Province",
      value: truncateValue(wilayaName, 255),
    },
    {
      key: "Province Code",
      value: String(wilayaCode).padStart(2, "0"),
    },
    {
      key: "Country",
      value: "DZ",
    },
    {
      key: "First Name",
      value: truncateValue(getTrimmedString(customer.firstName), 255),
    },
    {
      key: "Phone",
      value: truncateValue(normalizedPhone, 64),
    },
    {
      key: "Address",
      value: truncateValue(getTrimmedString(customer.address), 255),
    },
    {
      key: "City",
      value: truncateValue(customerCity, 255),
    },
  ];

  return attributes.filter(
    (attribute): attribute is { key: string; value: string } =>
      Boolean(attribute.value),
  );
}

function buildOrderTrackingMetafields(
  ownerId: string,
  request: Request,
  tracking: CodTracking,
) {
  const attributes = [
    {
      key: "client_ip_address",
      type: "single_line_text_field",
      value: truncateValue(getClientIpAddress(request), 64),
    },
    {
      key: "client_user_agent",
      type: "multi_line_text_field",
      value: truncateValue(
        getTrimmedString(request.headers.get("user-agent")) ||
          getTrimmedString(tracking.userAgent),
        1000,
      ),
    },
    {
      key: "event_id",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.eventId), 128),
    },
    {
      key: "fbp",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.fbp), 255),
    },
    {
      key: "fbc",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.fbc), 255),
    },
    {
      key: "fbclid",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.fbclid), 255),
    },
    {
      key: "event_source_url",
      type: "multi_line_text_field",
      value: truncateValue(toOptionalUrl(tracking.eventSourceUrl), 500),
    },
    {
      key: "referrer",
      type: "multi_line_text_field",
      value: truncateValue(
        toOptionalUrl(tracking.referrer) ||
          toOptionalUrl(request.headers.get("referer")),
        500,
      ),
    },
    {
      key: "browser_language",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.language), 64),
    },
    {
      key: "utm_source",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.utmSource), 255),
    },
    {
      key: "utm_medium",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.utmMedium), 255),
    },
    {
      key: "utm_campaign",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.utmCampaign), 255),
    },
    {
      key: "utm_content",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.utmContent), 255),
    },
    {
      key: "utm_term",
      type: "single_line_text_field",
      value: truncateValue(getTrimmedString(tracking.utmTerm), 255),
    },
  ];

  return attributes
    .filter((attribute) => Boolean(attribute.value))
    .map((attribute) => ({
      namespace: "cod_tracking",
      ownerId,
      key: attribute.key,
      type: attribute.type,
      value: attribute.value,
    }));
}

type OfflineSessionLike = {
  shop?: string;
  accessToken?: string;
};

async function callAdminGraphQL<TResponse extends AdminGraphQLResponse>(
  session: OfflineSessionLike,
  query: string,
  variables: Record<string, unknown>,
): Promise<TResponse> {
  if (!session.shop || !session.accessToken) {
    throw new Error("MISSING_APP_PROXY_SESSION");
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
    return (raw ? JSON.parse(raw) : {}) as TResponse;
  } catch (error) {
    console.error("COD Admin API invalid JSON:", {
      endpoint,
      body: raw,
      error,
    });
    throw new Error("INVALID_ADMIN_API_RESPONSE");
  }
}

async function upsertCodCustomer({
  session,
  customer,
  normalizedPhone,
  customerCity,
}: {
  session: OfflineSessionLike;
  customer: CodCustomer;
  normalizedPhone: string;
  customerCity: string;
}) {
  const email = getTrimmedString(customer.email);
  const firstName = getTrimmedString(customer.firstName);
  const lastName = getTrimmedString(customer.lastName);

  if (!normalizedPhone && !email) {
    throw new Error("CUSTOMER_CONTACT_REQUIRED");
  }

  const mutation = `#graphql
    mutation customerSet($input: CustomerSetInput!, $identifier: CustomerSetIdentifiers) {
      customerSet(input: $input, identifier: $identifier) {
        customer {
          id
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const address = {
    firstName,
    lastName,
    address1: getTrimmedString(customer.address),
    city: customerCity,
    countryCode: "DZ",
    phone: normalizedPhone,
  };
  const input = {
    firstName,
    lastName,
    ...(email ? { email } : {}),
    ...(normalizedPhone ? { phone: normalizedPhone } : {}),
    addresses: [address],
    tags: ["COD", "Vomoda COD Form"],
  };
  const identifier = normalizedPhone ? { phone: normalizedPhone } : { email };
  const result = await callAdminGraphQL<CustomerSetResponse>(
    session,
    mutation,
    {
      input,
      identifier,
    },
  );
  const payload = result.data?.customerSet;
  const graphQLErrors = result.errors ?? [];
  const userErrors = payload?.userErrors ?? [];

  if (!payload || graphQLErrors.length || userErrors.length) {
    console.error("COD customer upsert error:", {
      graphQLErrors,
      userErrors,
      result,
    });
    throw new Error(
      userErrors.map((error) => error.message).join(" | ") ||
        graphQLErrors.map((error) => error.message).join(" | ") ||
        "CUSTOMER_UPSERT_FAILED",
    );
  }

  const customerId = payload.customer?.id;

  if (!customerId) {
    throw new Error("CUSTOMER_UPSERT_MISSING_ID");
  }

  return customerId;
}

async function storeOrderTrackingMetafields({
  session,
  orderId,
  request,
  tracking,
}: {
  session: OfflineSessionLike;
  orderId: string;
  request: Request;
  tracking: CodTracking;
}) {
  const metafields = buildOrderTrackingMetafields(orderId, request, tracking);

  if (!metafields.length) {
    return;
  }

  const mutation = `#graphql
    mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        metafields {
          id
          namespace
          key
        }
        userErrors {
          field
          message
        }
      }
    }
  `;

  const result = await callAdminGraphQL<MetafieldsSetResponse>(
    session,
    mutation,
    {
      metafields,
    },
  );
  const graphQLErrors = result.errors ?? [];
  const userErrors = result.data?.metafieldsSet?.userErrors ?? [];

  if (graphQLErrors.length || userErrors.length) {
    console.error("COD order tracking metafields error:", {
      graphQLErrors,
      userErrors,
    });
  }
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    console.log("COD ROUTE HIT");

    const { session } = await authenticate.public.appProxy(request);
    const shop = normalizeShop(
      session?.shop || new URL(request.url).searchParams.get("shop") || "",
    );

    if (!shop) {
      return codJson({
        success: false,
        code: "APP_PROXY_UNAUTHENTICATED",
        error: "App proxy non authentifie",
      });
    }

    const fallbackAccessToken = session?.accessToken
      ? ""
      : await getShopAccessTokenByShop(shop);
    const adminSession =
      session?.shop && session?.accessToken
        ? {
            shop: normalizeShop(session.shop),
            accessToken: session.accessToken,
          }
        : fallbackAccessToken
          ? {
              shop,
              accessToken: fallbackAccessToken,
            }
          : null;

    if (!adminSession?.shop || !adminSession?.accessToken) {
      return codJson({
        success: false,
        code: "APP_PROXY_SESSION_UNAVAILABLE",
        error: "Session boutique indisponible",
      });
    }

    const body = await parseCodRequest(request);
    const customer = body.customer || {};
    const customerNote = getTrimmedString(body.note);
    const customerWilaya =
      typeof customer.wilaya === "string" ? customer.wilaya.trim() : "";
    const customerCity =
      typeof customer.city === "string" ? customer.city.trim() : "";
    const normalizedPhone = normalizeAlgeriaPhoneNumber(customer.phone);
    const wilayaName = getWilayaName(customerWilaya);
    const wilayaData = getWilayaData(customerWilaya);
    const items = Array.isArray(body.items) ? body.items : [];
    const tracking = body.tracking || {};
    const requestedShippingMethod =
      body.shipping?.method === "stop_desk" ? "stop_desk" : "home";

    if (!items.length) {
      return codJson({
        success: false,
        code: "EMPTY_CART",
        error: "Panier vide",
      });
    }

    if (!wilayaName || !wilayaData) {
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

    const shippingSettings = await getShippingSettingsByShop(shop);
    const shippingOptions = getShippingOptionsForWilaya(
      shippingSettings,
      wilayaName,
    );
    const activeShipping =
      shippingOptions.find((option) => option.id === requestedShippingMethod) ||
      shippingOptions[0] ||
      null;

    if (!activeShipping) {
      return codJson({
        success: false,
        code: "WILAYA_NOT_DELIVERABLE",
        error: "Desole, nous ne livrons pas a cette wilaya pour le moment.",
      });
    }

    const shippingTitle = activeShipping.label;
    const shippingPrice = activeShipping.price;
    let customerId = "";

    try {
      customerId = await upsertCodCustomer({
        session: adminSession,
        customer,
        normalizedPhone,
        customerCity,
      });
    } catch (customerError) {
      console.error("COD customer link failed:", customerError);

      return codJson({
        success: false,
        code: "CUSTOMER_LINK_FAILED",
        error:
          "Impossible de creer ou lier le client Shopify pour cette commande.",
        details:
          customerError instanceof Error
            ? customerError.message
            : "CUSTOMER_LINK_FAILED",
      });
    }

    const lineItems = items.map((item) => ({
      variantId: `gid://shopify/ProductVariant/${item.variant_id}`,
      quantity: Number(item.quantity) || 1,
      requiresShipping: true,
    }));

    const draftOrderCreateMutation = `#graphql
      mutation draftOrderCreate($input: DraftOrderInput!) {
        draftOrderCreate(input: $input) {
          draftOrder {
            id
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const draftOrderCreateVariables = {
      input: {
        lineItems,
        tags: ["COD", "Custom COD Form"],
        note: customerNote || "Commande COD creee via formulaire personnalise",
        customAttributes: buildVisibleOrderAttributes({
          request,
          tracking,
          customer,
          customerCity,
          normalizedPhone,
          shippingTitle,
          wilayaName,
          wilayaCode: wilayaData.code,
        }),
        ...(customer.email ? { email: customer.email } : {}),
        ...(normalizedPhone ? { phone: normalizedPhone } : {}),
        purchasingEntity: {
          customerId,
        },
        shippingLine: {
          title: `${shippingTitle} - ${wilayaName}`,
          priceWithCurrency: {
            amount: shippingPrice.toFixed(2),
            currencyCode: "DZD",
          },
        },
        shippingAddress: {
          firstName: customer.firstName || "",
          lastName: customer.lastName || "",
          address1: customer.address || "",
          city: customerCity,
          province: wilayaName,
          zip: wilayaData.zip,
          countryCode: "DZ",
          phone: normalizedPhone,
        },
        billingAddress: {
          firstName: customer.firstName || "",
          lastName: customer.lastName || "",
          address1: customer.address || "",
          city: customerCity,
          province: wilayaName,
          zip: wilayaData.zip,
          countryCode: "DZ",
          phone: normalizedPhone,
        },
      },
    };

    const draftOrderCreateResult =
      await callAdminGraphQL<DraftOrderCreateResponse>(
        adminSession,
        draftOrderCreateMutation,
        draftOrderCreateVariables,
      );

    console.log(
      "DRAFT ORDER CREATE RESULT:",
      JSON.stringify(draftOrderCreateResult, null, 2),
    );

    const draftOrderCreatePayload =
      draftOrderCreateResult.data?.draftOrderCreate;
    const draftOrderCreateErrors = draftOrderCreatePayload?.userErrors ?? [];
    const draftOrderCreateGraphQLErrors = draftOrderCreateResult.errors ?? [];

    if (!draftOrderCreatePayload) {
      return codJson({
        success: false,
        code: "DRAFT_ORDER_CREATE_NO_PAYLOAD",
        error: "Aucune reponse de creation de brouillon de commande",
        details: draftOrderCreateResult,
      });
    }

    if (draftOrderCreateGraphQLErrors.length) {
      return codJson({
        success: false,
        code: "GRAPHQL_ERROR",
        error: draftOrderCreateGraphQLErrors
          .map((e) => e.message || "Erreur GraphQL")
          .join(" | "),
        details: draftOrderCreateGraphQLErrors,
      });
    }

    if (draftOrderCreateErrors.length) {
      return codJson({
        success: false,
        code: "DRAFT_ORDER_CREATE_USER_ERROR",
        error: draftOrderCreateErrors.map((e) => e.message).join(" | "),
        details: draftOrderCreateErrors,
      });
    }

    const draftOrderId = draftOrderCreatePayload.draftOrder?.id;

    if (!draftOrderId) {
      return codJson({
        success: false,
        code: "DRAFT_ORDER_CREATE_MISSING_ID",
        error: "Brouillon de commande cree sans identifiant",
        details: draftOrderCreateResult,
      });
    }

    const draftOrderCompleteMutation = `#graphql
      mutation draftOrderComplete($id: ID!) {
        draftOrderComplete(id: $id, paymentPending: true) {
          draftOrder {
            id
            order {
              id
              name
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    const draftOrderCompleteResult =
      await callAdminGraphQL<DraftOrderCompleteResponse>(
        adminSession,
        draftOrderCompleteMutation,
        { id: draftOrderId },
      );

    console.log(
      "DRAFT ORDER COMPLETE RESULT:",
      JSON.stringify(draftOrderCompleteResult, null, 2),
    );

    const draftOrderCompletePayload =
      draftOrderCompleteResult.data?.draftOrderComplete;
    const createdOrder = draftOrderCompletePayload?.draftOrder?.order ?? null;
    const draftOrderCompleteErrors =
      draftOrderCompletePayload?.userErrors ?? [];
    const draftOrderCompleteGraphQLErrors =
      draftOrderCompleteResult.errors ?? [];
    const blockingGraphQLErrors = draftOrderCompleteGraphQLErrors.filter(
      (error) => !isProtectedOrderReadError(error),
    );

    if (!draftOrderCompletePayload) {
      return codJson({
        success: false,
        code: "DRAFT_ORDER_COMPLETE_NO_PAYLOAD",
        error: "Aucune reponse de finalisation de commande",
        details: draftOrderCompleteResult,
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

    if (draftOrderCompleteErrors.length) {
      return codJson({
        success: false,
        code: "DRAFT_ORDER_COMPLETE_USER_ERROR",
        error: draftOrderCompleteErrors.map((e) => e.message).join(" | "),
        details: draftOrderCompleteErrors,
      });
    }

    if (
      !createdOrder &&
      !(draftOrderCompleteResult.errors ?? []).some(isProtectedOrderReadError)
    ) {
      return codJson({
        success: false,
        code: "DRAFT_ORDER_COMPLETE_MISSING_ORDER",
        error: "Commande finalisee sans identifiant de commande",
        details: draftOrderCompleteResult,
      });
    }

    if (createdOrder?.id) {
      try {
        await storeOrderTrackingMetafields({
          session: adminSession,
          orderId: createdOrder.id,
          request,
          tracking,
        });
      } catch (trackingMetafieldsError) {
        console.error(
          "COD order tracking metafields unexpected error:",
          trackingMetafieldsError,
        );
      }
    }

    try {
      const metaSettings = await getMetaSettingsByShop(shop);

      if (
        metaSettings.metaEnabled &&
        metaSettings.metaPixelId &&
        metaSettings.metaConversionsApiToken
      ) {
        await sendMetaPurchaseEvent({
          pixelId: metaSettings.metaPixelId,
          accessToken: metaSettings.metaConversionsApiToken,
          testEventCode: metaSettings.metaTestEventCode,
          shop,
          customer: {
            email: customer.email || "",
            phone: normalizedPhone || customer.phone || "",
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
