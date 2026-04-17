import { useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  DEFAULT_META_SETTINGS,
  getMetaSettingsByShop,
  upsertMetaSettingsForShop,
} from "../models/meta-settings.server";
import { syncShopAccessFromSession } from "../models/shop-access.server";
import { authenticate } from "../shopify.server";

type ActionData = {
  ok: boolean;
  fieldErrors?: Partial<Record<keyof typeof DEFAULT_META_SETTINGS, string>>;
  formError?: string;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await syncShopAccessFromSession(session);
  const settings = await getMetaSettingsByShop(session.shop);

  return {
    shop: session.shop,
    settings,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await syncShopAccessFromSession(session);
  const formData = await request.formData();

  const values = {
    metaEnabled: formData.get("metaEnabled") === "on",
    metaPixelId: String(formData.get("metaPixelId") || "").trim(),
    metaConversionsApiToken: String(
      formData.get("metaConversionsApiToken") || "",
    ).trim(),
    metaTestEventCode: String(formData.get("metaTestEventCode") || "").trim(),
  };

  const fieldErrors: ActionData["fieldErrors"] = {};

  if (values.metaEnabled && !values.metaPixelId) {
    fieldErrors.metaPixelId =
      "Pixel ID is required when Meta tracking is enabled.";
  }

  const hasErrors = Object.values(fieldErrors).some(Boolean);
  if (hasErrors) {
    return {
      ok: false,
      fieldErrors,
      formError: "Please fix the highlighted field and save again.",
    } satisfies ActionData;
  }

  await upsertMetaSettingsForShop(session.shop, values);

  return {
    ok: true,
  } satisfies ActionData;
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;

  return (
    <p style={{ margin: "6px 0 0", color: "#b42318", fontSize: 13 }}>
      {message}
    </p>
  );
}

export default function FacebookPixelPage() {
  const { shop, settings } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();

  const isSaving =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const submittedSettings = fetcher.formData
    ? {
        metaEnabled: fetcher.formData.get("metaEnabled") === "on",
        metaPixelId: String(fetcher.formData.get("metaPixelId") || "").trim(),
        metaConversionsApiToken: String(
          fetcher.formData.get("metaConversionsApiToken") || "",
        ).trim(),
        metaTestEventCode: String(
          fetcher.formData.get("metaTestEventCode") || "",
        ).trim(),
      }
    : null;

  const activeSettings =
    fetcher.data?.ok && submittedSettings ? submittedSettings : settings;

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Facebook Pixel settings saved");
    }
  }, [fetcher.data?.ok, shopify]);

  const fieldErrors = fetcher.data?.fieldErrors || {};
  const formError = fetcher.data?.ok ? "" : fetcher.data?.formError || "";
  const capiReady = Boolean(
    activeSettings.metaPixelId && activeSettings.metaConversionsApiToken,
  );

  return (
    <s-page heading="Facebook Pixel">
      <s-section heading="Store connection">
        <s-paragraph>
          Save your Meta Pixel settings here and this app will configure the COD
          flow automatically for <strong>{shop}</strong>.
        </s-paragraph>
        <div
          style={{
            display: "grid",
            gap: 12,
            marginTop: 16,
            padding: 16,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            background: "#f8fafc",
          }}
        >
          <div style={{ fontSize: 14, color: "#111827" }}>
            Browser Pixel:{" "}
            <strong>
              {activeSettings.metaPixelId ? "Configured" : "Missing Pixel ID"}
            </strong>
          </div>
          <div style={{ fontSize: 14, color: "#111827" }}>
            Server Conversions API:{" "}
            <strong>{capiReady ? "Configured" : "Missing access token"}</strong>
          </div>
          <div style={{ fontSize: 14, color: "#111827" }}>
            COD order details:{" "}
            <strong>
              IP, user agent, _fbp, _fbc, event ID and UTM fields stored
            </strong>
          </div>
        </div>
      </s-section>

      <s-section heading="Meta configuration">
        <fetcher.Form method="post">
          <div
            style={{
              display: "grid",
              gap: 18,
              maxWidth: 720,
              paddingTop: 8,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                fontSize: 14,
                color: "#111827",
              }}
            >
              <input
                type="checkbox"
                name="metaEnabled"
                defaultChecked={settings.metaEnabled}
              />
              Enable Meta Pixel and server-side purchase tracking
            </label>

            <div>
              <label
                htmlFor="metaPixelId"
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                Meta Pixel ID
              </label>
              <input
                id="metaPixelId"
                name="metaPixelId"
                type="text"
                defaultValue={settings.metaPixelId}
                placeholder="123456789012345"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #d0d5dd",
                  fontSize: 14,
                }}
              />
              <FieldError message={fieldErrors.metaPixelId} />
            </div>

            <div>
              <label
                htmlFor="metaConversionsApiToken"
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                Conversions API access token
              </label>
              <input
                id="metaConversionsApiToken"
                name="metaConversionsApiToken"
                type="password"
                defaultValue={settings.metaConversionsApiToken}
                placeholder="EAAG..."
                autoComplete="off"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #d0d5dd",
                  fontSize: 14,
                }}
              />
              <p style={{ margin: "6px 0 0", color: "#667085", fontSize: 13 }}>
                This stays server-side. It is used for the Meta Conversions API
                purchase event and is never exposed to the storefront.
              </p>
            </div>

            <div>
              <label
                htmlFor="metaTestEventCode"
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                Test event code
              </label>
              <input
                id="metaTestEventCode"
                name="metaTestEventCode"
                type="text"
                defaultValue={settings.metaTestEventCode}
                placeholder="TEST12345"
                autoComplete="off"
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #d0d5dd",
                  fontSize: 14,
                }}
              />
              <p style={{ margin: "6px 0 0", color: "#667085", fontSize: 13 }}>
                Optional. Add this only while validating events in Meta Events
                Manager.
              </p>
            </div>

            {formError ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "#fef3f2",
                  color: "#b42318",
                  fontSize: 14,
                }}
              >
                {formError}
              </div>
            ) : null}

            {!activeSettings.metaConversionsApiToken ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "#fff7ed",
                  color: "#9a3412",
                  fontSize: 14,
                }}
              >
                Without a Conversions API token, the browser Pixel will load but
                server-side Purchase events will stay disabled.
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button
                type="submit"
                disabled={isSaving}
                style={{
                  border: "none",
                  borderRadius: 10,
                  background: "#111827",
                  color: "#fff",
                  padding: "12px 18px",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: isSaving ? "progress" : "pointer",
                }}
              >
                {isSaving ? "Saving..." : "Save Facebook Pixel settings"}
              </button>
              <span style={{ color: "#667085", fontSize: 13 }}>
                After saving, the storefront COD extension will use this
                configuration automatically.
              </span>
            </div>
          </div>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}
