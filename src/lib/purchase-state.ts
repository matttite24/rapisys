// Estado de una factura de compra: borrador, por recibir o recibida (badge de relleno, ver ui/badge.tsx).
export type PurchaseState = { label: "Borrador" | "Por recibir" | "Recibida"; variant: "solid-pending" | "solid-arriving" | "solid-stock" };
export function purchaseState(status: "draft" | "complete", t?: { units: number | string; received: number | string } | null): PurchaseState {
  if (status === "draft") return { label: "Borrador", variant: "solid-pending" };
  if (t && Number(t.received) >= Number(t.units) && Number(t.units) > 0) return { label: "Recibida", variant: "solid-stock" };
  return { label: "Por recibir", variant: "solid-arriving" };
}
