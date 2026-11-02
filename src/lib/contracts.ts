export const VAT_RATE = 15;

export const STATUS_LABEL: Record<string, string> = {
  new: "Nuevo",
  in_progress: "En ejecución",
  finished: "Finalizado",
  invoiced: "Facturado",
  pending_payment: "Pendiente de cobro",
  paid: "Cobrado",
};

// Orden del ciclo de vida del contrato.
export const STATUS_ORDER = [
  "new",
  "in_progress",
  "finished",
  "invoiced",
  "pending_payment",
  "paid",
] as const;

// Fases de cada línea (item) dentro del contrato, en orden.
export const PHASE_ORDER = [
  "pending",
  "quoted",
  "purchased",
  "received",
  "in_stock",
  "ready",
  "delivered",
] as const;
export type Phase = (typeof PHASE_ORDER)[number];

export const PHASE_LABEL: Record<Phase, string> = {
  pending: "Pendiente",
  quoted: "Proformado",
  purchased: "Comprado",
  received: "Recibido",
  in_stock: "En stock",
  ready: "Listo para entrega",
  delivered: "Entregado",
};

// Desde "En stock" en adelante deben estar recibidas todas las unidades.
export const NEEDS_FULL_RECEIPT: Phase[] = ["in_stock", "ready", "delivered"];

// Punto de color por fase; el texto siempre acompaña, el color no va solo.
export const STATUS_DOT: Record<string, string> = {
  new: "bg-muted-foreground",
  in_progress: "bg-brand",
  finished: "bg-sky-600",
  invoiced: "bg-violet-600",
  pending_payment: "bg-amber-500",
  paid: "bg-emerald-600",
};

const money = new Intl.NumberFormat("es-EC", { style: "currency", currency: "USD" });
export const formatMoney = (n: number) => money.format(n);

// Acepta "1.234,56", "1,234.56", "1234,56" o "$ 1234.56". `decimals` fija el redondeo.
export function parseMoney(raw: string, decimals = 2): number | null {
  let s = raw.replace(/[\s$]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    // El último separador es el decimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".")
      ? s.replace(/\./g, "").replace(",", ".")
      : s.replace(/,/g, "");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = Number(s);
  const f = 10 ** decimals;
  return Number.isFinite(n) && n >= 0 ? Math.round(n * f) / f : null;
}

// El total incluye IVA: se desglosa en subtotal e IVA.
export function splitVat(total: number, rate = VAT_RATE) {
  const subtotal = Math.round((total / (1 + rate / 100)) * 100) / 100;
  return { subtotal, vat: Math.round((total - subtotal) * 100) / 100 };
}
