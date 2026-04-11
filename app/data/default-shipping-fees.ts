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

const LEGACY_HOME_SHIPPING_PRICES_DA: Record<string, number> = {
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
    const homePrice =
      LEGACY_HOME_SHIPPING_PRICES_DA[normalizeAlgeriaLocationName(wilaya)] ??
      null;

    return [
      wilaya,
      {
        home: homePrice,
        stopDesk:
          homePrice === null ? null : roundMoney(Math.max(homePrice - 100, 0)),
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
