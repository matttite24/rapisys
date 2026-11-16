import type { Tone } from "@/lib/state-tone";

export const VAT_RATE = 15;

export type ContractKind = "standard" | "credit";

// Ciclo del proceso a crédito: usa los mismos estados de base de datos (sin "finished" ni "pending_payment").
// "in_progress" se muestra como Abierto, o Entregando cuando ya hay una entrega.
export const CREDIT_ORDER = ["in_progress", "invoiced", "paid"] as const;
export const CREDIT_LABEL: Record<string, string> = {
  in_progress: "Abierto",
  delivering: "Entregando",
  invoiced: "Facturado",
  paid: "Cobrado",
};
// Orden de estados según el tipo de proceso.
export const orderFor = (kind: string | undefined): readonly string[] => (kind === "credit" ? CREDIT_ORDER : STATUS_ORDER);
// Texto del estado: en crédito, un proceso en ejecución con entregas es "Entregando".
export function statusText(status: string, kind?: string, deliveries = 0): string {
  if (kind !== "credit") return STATUS_LABEL[status] ?? status;
  return CREDIT_LABEL[status === "in_progress" && deliveries > 0 ? "delivering" : status] ?? status;
}

export const STATUS_LABEL: Record<string, string> = {
  new: "Nuevo",
  in_progress: "En ejecución",
  finished: "Finalizado",
  invoiced: "Facturado",
  pending_payment: "Pendiente de cobro",
  paid: "Cobrado",
};

// Orden del ciclo de vida del proceso.
export const STATUS_ORDER = [
  "new",
  "in_progress",
  "finished",
  "invoiced",
  "pending_payment",
  "paid",
] as const;

// Fases de cada línea (item) dentro del proceso, en orden.
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
  quoted: "Cotizando",
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
  new: "bg-state-pending",
  in_progress: "bg-state-running",
  finished: "bg-state-stock",
  invoiced: "bg-state-partial",
  pending_payment: "bg-state-partial",
  paid: "bg-state-stock",
};

// Tono de cada fase del proceso: naranja en ejecución, amarillo en espera de cobro, verde completo.
export const STATUS_TONE: Record<string, Tone> = {
  new: "pending",
  in_progress: "running",
  finished: "stock",
  invoiced: "partial",
  pending_payment: "partial",
  paid: "stock",
};

// Tope de líneas de una lista del proceso, y tamaño de página de la tabla.
export const MAX_LINES_PER_LIST = 1000;
export const LINES_PAGE_SIZE = 50;
