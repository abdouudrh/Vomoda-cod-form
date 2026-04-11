import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { ALGERIA_WILAYA_DATA } from "../data/algeria-locations";
import { authenticate } from "../shopify.server";

function proxyJson(payload: Record<string, unknown>) {
  return json(payload, {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  try {
    await authenticate.public.appProxy(request);

    return proxyJson({
      success: true,
      wilayas: ALGERIA_WILAYA_DATA,
    });
  } catch (error) {
    console.error("COD locations loader error:", error);

    return proxyJson({
      success: false,
      error: "Impossible de charger les localites",
    });
  }
}
