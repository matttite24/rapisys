import { VAT_RATE } from "@/lib/contracts";

export const MARGIN_PRESETS = [40, 50, 70, 100] as const;

export const ASSET_KIND_LABEL = {
  light_vehicle: "Vehículo liviano",
  heavy_vehicle: "Vehículo pesado",
  machinery: "Maquinaria",
} as const;
export type AssetKind = keyof typeof ASSET_KIND_LABEL;

export type PriceRow = {
  supplier_id: string;
  unit_cost: string;
  vat_rate: string;
  supplier_sku: string;
};
export type SpecRow = { key: string; value: string };

export const DEFAULT_VAT = String(VAT_RATE);

const round2 = (n: number) => Math.round(n * 100) / 100;

// Costo con IVA a partir del costo sin IVA y la tarifa, por separado.
export const withVat = (cost: number, vat: number) => round2(cost * (1 + vat / 100));

// Precio de venta sin IVA: costo + margen de utilidad sobre el costo.
export const salePrice = (cost: number, marginPercent: number) =>
  round2(cost * (1 + marginPercent / 100));
