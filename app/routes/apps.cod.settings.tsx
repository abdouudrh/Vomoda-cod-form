import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { getMetaSettingsByShop } from "../models/meta-settings.server";
import { authenticate } from "../shopify.server";

function proxyJson(payload: Record<string, unknown>) {
  return json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    const { session } = await authenticate.public.appProxy(request);

    if (!session?.shop) {
      throw new Error("APP_PROXY_UNAUTHENTICATED");
    }

    const settings = await getMetaSettingsByShop(session.shop);

    return proxyJson({
      success: true,
      settings: {
        metaEnabled: settings.metaEnabled,
        metaPixelId: settings.metaPixelId,
      },
    });
  } catch (error) {
    console.error("COD settings loader error:", error);

    return proxyJson({
      success: false,
      settings: {
        metaEnabled: false,
        metaPixelId: "",
      },
    });
  }
}
