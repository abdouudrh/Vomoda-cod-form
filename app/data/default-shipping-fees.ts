import {
  ALGERIA_WILAYA_DATA,
  type AlgeriaWilayaName,
  normalizeAlgeriaLocationName,
} from "./algeria-locations";

export type ShippingFeeValue = {
  home: number | null;
  stopDesk: number | null;
};

export type ShippingFeesMap = Record<AlgeriaWilayaName, ShippingFeeValue>;

const DEFAULT_SHIPPING_FEES_INPUT_DA: Record<
  string,
  { home: number; stopDesk: number }
> = {
  adrar: { home: 1200, stopDesk: 1000 },
  chlef: { home: 700, stopDesk: 500 },
  laghouat: { home: 900, stopDesk: 600 },
  "oum el bouaghi": { home: 800, stopDesk: 500 },
  batna: { home: 800, stopDesk: 500 },
  bejaia: { home: 700, stopDesk: 500 },
  biskra: { home: 900, stopDesk: 600 },
  bechar: { home: 1000, stopDesk: 700 },
  blida: { home: 600, stopDesk: 500 },
  bouira: { home: 600, stopDesk: 500 },
  tamanrasset: { home: 1400, stopDesk: 1000 },
  tebessa: { home: 900, stopDesk: 600 },
  tlemcen: { home: 800, stopDesk: 600 },
  tiaret: { home: 800, stopDesk: 500 },
  "tizi ouzou": { home: 700, stopDesk: 500 },
  alger: { home: 400, stopDesk: 300 },
  djelfa: { home: 900, stopDesk: 600 },
  jijel: { home: 800, stopDesk: 500 },
  setif: { home: 800, stopDesk: 500 },
  saida: { home: 900, stopDesk: 600 },
  skikda: { home: 800, stopDesk: 500 },
  "sidi bel abbes": { home: 900, stopDesk: 600 },
  annaba: { home: 750, stopDesk: 500 },
  guelma: { home: 800, stopDesk: 600 },
  constantine: { home: 800, stopDesk: 500 },
  medea: { home: 800, stopDesk: 500 },
  mostaganem: { home: 800, stopDesk: 500 },
  "m sila": { home: 800, stopDesk: 600 },
  mascara: { home: 900, stopDesk: 500 },
  ouargla: { home: 900, stopDesk: 600 },
  oran: { home: 700, stopDesk: 500 },
  "el bayadh": { home: 1100, stopDesk: 700 },
  illizi: { home: 0, stopDesk: 0 },
  "bordj bou arreridj": { home: 800, stopDesk: 500 },
  boumerdes: { home: 700, stopDesk: 500 },
  "el tarf": { home: 800, stopDesk: 500 },
  tindouf: { home: 0, stopDesk: 0 },
  tissemsilt: { home: 900, stopDesk: 500 },
  "el oued": { home: 900, stopDesk: 650 },
  khenchela: { home: 800, stopDesk: 500 },
  "souk ahras": { home: 900, stopDesk: 500 },
  tipaza: { home: 700, stopDesk: 500 },
  mila: { home: 900, stopDesk: 500 },
  "ain defla": { home: 900, stopDesk: 500 },
  naama: { home: 1100, stopDesk: 700 },
  "ain temouchent": { home: 900, stopDesk: 500 },
  ghardaia: { home: 900, stopDesk: 600 },
  relizane: { home: 900, stopDesk: 500 },
  timimoun: { home: 1200, stopDesk: 900 },
  "bordj badji mokhtar": { home: 0, stopDesk: 0 },
  "ouled djellal": { home: 900, stopDesk: 600 },
  "beni abbes": { home: 0, stopDesk: 0 },
  "in salah": { home: 1400, stopDesk: 1100 },
  "in guezzam": { home: 1400, stopDesk: 0 },
  touggourt: { home: 900, stopDesk: 600 },
  djanet: { home: 0, stopDesk: 0 },
  "el meghaier": { home: 900, stopDesk: 600 },
  "el menia": { home: 1000, stopDesk: 700 },
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }

  return roundMoney(value);
}

export const DEFAULT_SHIPPING_FEES: ShippingFeesMap = Object.fromEntries(
  (Object.keys(ALGERIA_WILAYA_DATA) as AlgeriaWilayaName[]).map((wilaya) => {
    const priceConfig =
      DEFAULT_SHIPPING_FEES_INPUT_DA[normalizeAlgeriaLocationName(wilaya)] ??
      null;

    return [
      wilaya,
      {
        home:
          priceConfig && priceConfig.home > 0 ? roundMoney(priceConfig.home) : null,
        stopDesk:
          priceConfig && priceConfig.stopDesk > 0
            ? roundMoney(priceConfig.stopDesk)
            : null,
      },
    ];
  }),
) as ShippingFeesMap;

export function cloneDefaultShippingFees(): ShippingFeesMap {
  return JSON.parse(JSON.stringify(DEFAULT_SHIPPING_FEES)) as ShippingFeesMap;
}

export function normalizeShippingFeesMap(
  input?: unknown,
  fallback: ShippingFeesMap = DEFAULT_SHIPPING_FEES,
): ShippingFeesMap {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, { home?: unknown; stopDesk?: unknown }>)
      : {};

  return Object.fromEntries(
    (Object.keys(ALGERIA_WILAYA_DATA) as AlgeriaWilayaName[]).map((wilaya) => {
      const raw = source[wilaya];
      const defaultValue = fallback[wilaya] ?? DEFAULT_SHIPPING_FEES[wilaya];

      return [
        wilaya,
        {
          home:
            raw && Object.prototype.hasOwnProperty.call(raw, "home")
              ? toOptionalNumber(raw.home)
              : defaultValue.home,
          stopDesk:
            raw && Object.prototype.hasOwnProperty.call(raw, "stopDesk")
              ? toOptionalNumber(raw.stopDesk)
              : defaultValue.stopDesk,
        },
      ];
    }),
  ) as ShippingFeesMap;
}
