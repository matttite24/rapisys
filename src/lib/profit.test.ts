import { describe, expect, it } from "vitest";
import { lineProfit, summarizeProfit } from "./profit";

const line = (referenceCents: number | null, costCents: number, sources = 1, unknown = 0) => ({ referenceCents, costCents, sources, unknown });

describe("rentabilidad", () => {
  it("utilidad de una línea = precio ref. − costo", () => {
    expect(lineProfit(line(10000, 7000))).toEqual({ kind: "ok", profitCents: 3000, marginPct: 30, markupPct: (3000 / 7000) * 100 });
  });
  it("sin precio ref. o sin compras no calcula", () => {
    expect(lineProfit(line(null, 0)).kind).toBe("none");
    expect(lineProfit(line(10000, 0, 0)).kind).toBe("pending");
  });
  it("costo incompleto se marca como parcial", () => {
    expect(lineProfit(line(10000, 5000, 2, 1)).kind).toBe("partial");
  });
  it("contrato = suma de utilidades − gastos", () => {
    const r = summarizeProfit(
      [
        { reference: 10000, cost: 7000, pending: 0, noPrice: 0, partial: 0 },
        { reference: 5000, cost: 6000, pending: 1, noPrice: 1, partial: 0 },
      ],
      1000,
    );
    expect(r.itemsProfit).toBe(2000);
    expect(r.profit).toBe(1000);
    expect(r.noPrice).toBe(1);
    expect(r.pending).toBe(1);
    expect(r.marginPct).toBeCloseTo(6.67, 1);
  });
});
