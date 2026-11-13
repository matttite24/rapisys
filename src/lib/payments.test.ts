import { describe, expect, it } from "vitest";
import { paymentState } from "./payments";

const m = (kind: "payment" | "credit" | "advance", amount_cents: number, due_on: string | null = null) => ({ kind, amount_cents, due_on });

describe("paymentState", () => {
  it("sin movimientos: sin pagos", () => {
    expect(paymentState(10000, [], "2026-11-09")).toMatchObject({ label: "Sin pagos", owedCents: 10000 });
  });
  it("pagos y anticipos suman; el total pagado es Pagada", () => {
    expect(paymentState(10000, [m("payment", 4000)], "2026-11-09")).toMatchObject({ label: "Pago parcial", owedCents: 6000 });
    expect(paymentState(10000, [m("payment", 4000), m("advance", 6000)], "2026-11-09")).toMatchObject({ label: "Pagada", owedCents: 0 });
  });
  it("el crédito es deuda con vencimiento y vence si pasó la fecha", () => {
    expect(paymentState(10000, [m("credit", 10000, "2026-12-01")], "2026-11-09")).toMatchObject({ label: "A crédito", dueOn: "2026-12-01", owedCents: 10000 });
    expect(paymentState(10000, [m("credit", 10000, "2026-11-01")], "2026-11-09").label).toBe("Crédito vencido");
  });
  it("un crédito ya pagado por completo es Pagada", () => {
    expect(paymentState(10000, [m("credit", 10000, "2026-11-01"), m("payment", 10000)], "2026-11-09").label).toBe("Pagada");
  });
});
