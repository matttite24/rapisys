// Pagos de facturas, créditos y anticipos a proveedores.
export const PAY_METHODS = { transfer: "Transferencia", cash: "Efectivo", check: "Cheque", card: "Tarjeta", other: "Otro" } as const;
export type PayMethod = keyof typeof PAY_METHODS;
export const isPayMethod = (v: string): v is PayMethod => Object.hasOwn(PAY_METHODS, v);

// Tipos de movimiento de una factura.
export const MOVEMENT_LABEL = { payment: "Pago", credit: "A crédito", advance: "Anticipo aplicado" } as const;
export type MovementKind = keyof typeof MOVEMENT_LABEL;
export const isMovementKind = (v: string): v is MovementKind => Object.hasOwn(MOVEMENT_LABEL, v);

// Tipos de la lista de Pagos del proceso.
export const PAYMENT_KIND_LABEL = { expense: "Gasto", payment: "Pago de factura", credit: "Crédito", advance: "Anticipo" } as const;
export type PaymentKind = keyof typeof PAYMENT_KIND_LABEL;
export const isPaymentKind = (v: string): v is PaymentKind => Object.hasOwn(PAYMENT_KIND_LABEL, v);

export type PaymentRow = {
  kind: PaymentKind;
  id: string;
  on_date: string;
  concept: string;
  who: string;
  amount_cents: number;
  method: string | null;
  reference: string | null;
  purchase_id: string | null;
  due_on: string | null;
};

export type Movement = {
  id: string;
  kind: MovementKind;
  amount_cents: number;
  moved_on: string;
  due_on: string | null;
  method: string | null;
  bank: string | null;
  advance_ref: string | null;
  reference: string;
  notes: string;
};

export type AdvanceOption = { id: string; label: string; remainingCents: number };
export type BankOption = { id: string; label: string };

// Lo registrado en una factura: pagado = pagos + anticipos aplicados; a crédito aparte; saldo = lo que falta registrar.
export function invoiceBalance(totalCents: number, movements: { kind: MovementKind; amount_cents: number }[]) {
  const sum = (kinds: MovementKind[]) => movements.filter((m) => kinds.includes(m.kind)).reduce((s, m) => s + m.amount_cents, 0);
  const paid = sum(["payment", "advance"]);
  const credit = sum(["credit"]);
  return { total: totalCents, paid, credit, pending: Math.max(0, totalCents - paid - credit) };
}

// Estado de pago de una factura, para la lista de compras. Pagado = pagos + anticipos aplicados; el crédito
// es deuda con vencimiento (no es dinero que ya salió).
export type PaymentState = {
  label: "Sin pagos" | "Pago parcial" | "A crédito" | "Crédito vencido" | "Pagada";
  variant: "solid-pending" | "solid-arriving" | "solid-partial" | "solid-stock" | "solid-running";
  // Lo que falta por pagar (total − pagado) y el vencimiento más próximo de un crédito pendiente.
  owedCents: number;
  dueOn: string | null;
};

export function paymentState(
  totalCents: number,
  movements: { kind: MovementKind; amount_cents: number; due_on: string | null }[],
  today: string,
): PaymentState {
  const paid = movements.filter((m) => m.kind !== "credit").reduce((s, m) => s + m.amount_cents, 0);
  const owedCents = Math.max(0, totalCents - paid);
  const dues = movements.filter((m) => m.kind === "credit" && m.due_on).map((m) => m.due_on as string).sort();
  const dueOn = owedCents > 0 ? (dues[0] ?? null) : null;
  if (totalCents > 0 && owedCents === 0) return { label: "Pagada", variant: "solid-stock", owedCents, dueOn: null };
  if (dueOn && dueOn < today) return { label: "Crédito vencido", variant: "solid-running", owedCents, dueOn };
  if (dueOn) return { label: "A crédito", variant: "solid-partial", owedCents, dueOn };
  if (paid > 0) return { label: "Pago parcial", variant: "solid-arriving", owedCents, dueOn: null };
  return { label: "Sin pagos", variant: "solid-pending", owedCents, dueOn: null };
}
