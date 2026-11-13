import { describe, expect, it } from "vitest";
import { billingRow, billingTotals } from "./billing";

const base = { costCents: 11500, referenceCents: 20000, sources: 1, marginOverride: null, excluded: false };

describe("reporte de cobro", () => {
  it("sin ajuste usa el valor final original y el margen real sobre el costo", () => {
    const r = billingRow(base);
    expect(r).toMatchObject({ counts: true, finalCents: 20000, profitCents: 8500 });
    expect(r.marginPct).toBeCloseTo(73.9, 1);
  });
  it("con margen ajustado, valor final = costo × (1 + margen)", () => {
    expect(billingRow({ ...base, marginOverride: 40 })).toMatchObject({ finalCents: 16100, profitCents: 4600, marginPct: 40 });
  });
  it("una línea omitida no cuenta, y sin compra tampoco", () => {
    expect(billingRow({ ...base, excluded: true }).counts).toBe(false);
    expect(billingRow({ ...base, sources: 0, costCents: 0 }).counts).toBe(false);
    expect(billingRow({ ...base, referenceCents: null }).counts).toBe(false);
  });
  it("el margen ajustado sin compra no inventa un valor final", () => {
    expect(billingRow({ ...base, sources: 0, costCents: 0, marginOverride: 40 }).finalCents).toBe(20000);
  });
  it("los totales suman solo las que cuentan", () => {
    const rows = [
      { cost: 11500, row: billingRow({ ...base, marginOverride: 40 }) },
      { cost: 11500, row: billingRow({ ...base, excluded: true }) },
    ];
    expect(billingTotals(rows)).toMatchObject({ cost: 11500, final: 16100, profit: 4600 });
  });
});
