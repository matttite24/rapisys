import type { Tone } from "@/lib/state-tone";

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

// Tono de cada fase del contrato: naranja en ejecución, amarillo en espera de cobro, verde completo.
export const STATUS_TONE: Record<string, Tone> = {
  new: "pending",
  in_progress: "running",
  finished: "stock",
  invoiced: "partial",
  pending_payment: "partial",
  paid: "stock",
};

// Tope de líneas de una lista del contrato, y tamaño de página de la tabla.
export const MAX_LINES_PER_LIST = 1000;
export const LINES_PAGE_SIZE = 25;
