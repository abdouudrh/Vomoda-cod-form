import { useEffect, useState } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import { ALGERIA_WILAYA_DATA, type AlgeriaWilayaName } from "../data/algeria-locations";
import type { ShippingFeesMap } from "../data/default-shipping-fees";
import {
  getShippingSettingsByShop,
  upsertShippingSettingsForShop,
} from "../models/shipping-settings.server";
import { syncShopAccessFromSession } from "../models/shop-access.server";
import { authenticate } from "../shopify.server";

type ShippingRow = {
  name: AlgeriaWilayaName;
  code: number;
  home: string;
  stopDesk: string;
};

type ActionData = {
  ok: boolean;
  formError?: string;
};

function formatFeeInput(value: number | null) {
  return typeof value === "number" ? String(value) : "";
}

function parseOptionalFee(value: unknown) {
  const raw = String(value ?? "").trim();

  if (!raw) {
    return { value: null as number | null, error: "" };
  }

  const normalized = raw.replace(",", ".");
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount < 0) {
    return {
      value: null as number | null,
      error: "Use a valid positive amount or leave the field empty.",
    };
  }

  return {
    value: Math.round(amount * 100) / 100,
    error: "",
  };
}

function buildShippingRows(shippingFees: ShippingFeesMap): ShippingRow[] {
  return (Object.entries(ALGERIA_WILAYA_DATA) as Array<
    [AlgeriaWilayaName, (typeof ALGERIA_WILAYA_DATA)[AlgeriaWilayaName]]
  >)
    .sort(([, a], [, b]) => Number(a.code || 0) - Number(b.code || 0))
    .map(([name, data]) => ({
      name,
      code: Number(data.code || 0),
      home: formatFeeInput(shippingFees[name]?.home ?? null),
      stopDesk: formatFeeInput(shippingFees[name]?.stopDesk ?? null),
    }));
}

function rowsToPayload(rows: ShippingRow[]) {
  return Object.fromEntries(
    rows.map((row) => [
      row.name,
      {
        home: row.home,
        stopDesk: row.stopDesk,
      },
    ]),
  );
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await syncShopAccessFromSession(session);
  const shippingFees = await getShippingSettingsByShop(session.shop);

  return {
    shop: session.shop,
    rows: buildShippingRows(shippingFees),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  await syncShopAccessFromSession(session);
  const formData = await request.formData();
  const rawJson = String(formData.get("shippingFeesJson") || "").trim();

  let parsed: Record<string, { home?: unknown; stopDesk?: unknown }> = {};

  try {
    parsed = rawJson
      ? (JSON.parse(rawJson) as Record<string, { home?: unknown; stopDesk?: unknown }>)
      : {};
  } catch {
    return {
      ok: false,
      formError: "Invalid shipping configuration payload.",
    } satisfies ActionData;
  }

  const nextFees = {} as ShippingFeesMap;

  for (const wilayaName of Object.keys(ALGERIA_WILAYA_DATA) as AlgeriaWilayaName[]) {
    const rawRow = parsed[wilayaName] || {};
    const home = parseOptionalFee(rawRow.home);
    const stopDesk = parseOptionalFee(rawRow.stopDesk);

    if (home.error || stopDesk.error) {
      return {
        ok: false,
        formError: `Invalid amount detected for ${wilayaName}. Use a positive number or leave the field empty.`,
      } satisfies ActionData;
    }

    nextFees[wilayaName] = {
      home: home.value,
      stopDesk: stopDesk.value,
    };
  }

  await upsertShippingSettingsForShop(session.shop, nextFees);

  return {
    ok: true,
  } satisfies ActionData;
};

export default function ShippingFeesPage() {
  const { shop, rows: initialRows } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<ActionData>();
  const shopify = useAppBridge();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ShippingRow[]>(initialRows);

  useEffect(() => {
    setRows(initialRows);
  }, [initialRows]);

  useEffect(() => {
    if (fetcher.data?.ok) {
      shopify.toast.show("Shipping fees saved");
    }
  }, [fetcher.data?.ok, shopify]);

  const isSaving =
    ["loading", "submitting"].includes(fetcher.state) &&
    fetcher.formMethod === "POST";

  const normalizedQuery = query.trim().toLowerCase();
  const filteredRows = rows.filter((row) => {
    if (!normalizedQuery) return true;

    return (
      row.name.toLowerCase().includes(normalizedQuery) ||
      String(row.code).padStart(2, "0").includes(normalizedQuery)
    );
  });

  return (
    <s-page heading="Shipping fees">
      <s-section heading="Per-wilaya delivery rules">
        <s-paragraph>
          Manage stop desk and home delivery fees for <strong>{shop}</strong>.
          Leave a fee empty to disable that delivery method for the wilaya.
        </s-paragraph>
        <div
          style={{
            marginTop: 12,
            padding: 14,
            borderRadius: 12,
            border: "1px solid #fed7aa",
            background: "#fff7ed",
            color: "#9a3412",
            fontSize: 14,
            lineHeight: 1.55,
          }}
        >
          If both fees are empty, the wilaya becomes not deliverable. The COD
          form will show a French warning and customers will not be able to
          finish the order.
        </div>
      </s-section>

      <s-section heading="Shipping fees table">
        <fetcher.Form method="post">
          <input
            type="hidden"
            name="shippingFeesJson"
            value={JSON.stringify(rowsToPayload(rows))}
          />

          <div
            style={{
              display: "grid",
              gap: 16,
              maxWidth: 980,
              paddingTop: 8,
            }}
          >
            <div>
              <label
                htmlFor="shipping-search"
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 600,
                  color: "#111827",
                }}
              >
                Search wilaya
              </label>
              <input
                id="shipping-search"
                type="text"
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                placeholder="Search by wilaya name or code"
                style={{
                  width: "100%",
                  maxWidth: 360,
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: "1px solid #d0d5dd",
                  fontSize: 14,
                }}
              />
            </div>

            <div style={{ color: "#667085", fontSize: 13 }}>
              Home delivery and stop desk amounts are in DZD. Empty field means
              unavailable.
            </div>

            <div
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 14,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "92px minmax(220px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr)",
                  gap: 0,
                  padding: "14px 16px",
                  background: "#f8fafc",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "#344054",
                }}
              >
                <div>Code</div>
                <div>Wilaya</div>
                <div>Livraison a domicile</div>
                <div>Stop desk</div>
              </div>

              {filteredRows.length ? (
                filteredRows.map((row) => {
                  const rowIndex = rows.findIndex((item) => item.name === row.name);

                  return (
                    <div
                      key={row.name}
                      style={{
                        display: "grid",
                        gridTemplateColumns:
                          "92px minmax(220px, 1fr) minmax(180px, 1fr) minmax(180px, 1fr)",
                        gap: 0,
                        padding: "14px 16px",
                        borderTop: "1px solid #e5e7eb",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ fontSize: 14, color: "#475467" }}>
                        {String(row.code).padStart(2, "0")}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "#111827" }}>
                        {row.name}
                      </div>
                      <div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.home}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setRows((current) =>
                              current.map((item, index) =>
                                index === rowIndex ? { ...item, home: nextValue } : item,
                              ),
                            );
                          }}
                          placeholder="Not deliverable"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #d0d5dd",
                            fontSize: 14,
                          }}
                        />
                      </div>
                      <div>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.stopDesk}
                          onChange={(event) => {
                            const nextValue = event.currentTarget.value;
                            setRows((current) =>
                              current.map((item, index) =>
                                index === rowIndex ? { ...item, stopDesk: nextValue } : item,
                              ),
                            );
                          }}
                          placeholder="Not available"
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: 10,
                            border: "1px solid #d0d5dd",
                            fontSize: 14,
                          }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div
                  style={{
                    padding: "18px 16px",
                    borderTop: "1px solid #e5e7eb",
                    color: "#667085",
                    fontSize: 14,
                  }}
                >
                  No wilaya matches your search.
                </div>
              )}
            </div>

            {fetcher.data?.ok ? null : fetcher.data?.formError ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 10,
                  background: "#fef3f2",
                  color: "#b42318",
                  fontSize: 14,
                }}
              >
                {fetcher.data.formError}
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
                {isSaving ? "Saving..." : "Save shipping fees"}
              </button>
              <span style={{ color: "#667085", fontSize: 13 }}>
                Empty fee = unavailable delivery method for that wilaya.
              </span>
            </div>
          </div>
        </fetcher.Form>
      </s-section>
    </s-page>
  );
}
