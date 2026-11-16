// Tonos de estado. Un solo lugar define cómo se ve cada uno, en claro y en oscuro (los valores viven en globals.css).
//   · tinte:  fondo = marca al 15 % sobre el fondo de la página, texto = variante oscura/clara (--state-*-ink).
//   · sólido: fondo = --state-*-solid (más profundo en claro, más claro en oscuro), texto = --state-*-on: contraste alto.
//   · punto:  solo la marca, para los círculos de color.
export type Tone = "pending" | "partial" | "arriving" | "stock" | "delivered" | "running" | "quoted";

export const TONE_CLASS: Record<Tone, string> = {
  pending: "bg-state-pending/15 text-state-pending-ink",
  partial: "bg-state-partial/15 text-state-partial-ink",
  arriving: "bg-state-arriving/15 text-state-arriving-ink",
  stock: "bg-state-stock/15 text-state-stock-ink",
  delivered: "bg-state-delivered/15 text-state-delivered-ink",
  running: "bg-state-running/15 text-state-running-ink",
  quoted: "bg-state-quoted/15 text-state-quoted-ink",
};

export const TONE_SOLID: Record<Tone, string> = {
  pending: "bg-state-pending-solid text-state-pending-on",
  partial: "bg-state-partial-solid text-state-partial-on",
  arriving: "bg-state-arriving-solid text-state-arriving-on",
  stock: "bg-state-stock-solid text-state-stock-on",
  delivered: "bg-state-delivered-solid text-state-delivered-on",
  running: "bg-state-running-solid text-state-running-on",
  quoted: "bg-state-quoted-solid text-state-quoted-on",
};

export const TONE_DOT: Record<Tone, string> = {
  pending: "bg-state-pending",
  partial: "bg-state-partial",
  arriving: "bg-state-arriving",
  stock: "bg-state-stock",
  delivered: "bg-state-delivered",
  running: "bg-state-running",
  quoted: "bg-state-quoted",
};
