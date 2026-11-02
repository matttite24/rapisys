import { describe, expect, it } from "vitest";
import {
  centsToInput,
  formatCents,
  lineAmounts,
  parseCents,
  parseDecimal,
  salePriceCents,
  splitVat,
  withVatCents,
} from "./money";

const ok = (raw: string) => parseCents(raw).cents;

describe("parseCents", () => {
  it("lee los formatos habituales", () => {
    expect(ok("1250")).toBe(125000);
    expect(ok("1250,50")).toBe(125050);
    expect(ok("1.250,50")).toBe(125050);
    expect(ok("1,250.50")).toBe(125050);
    expect(ok("$ 1250.5")).toBe(125050);
    expect(ok("0,07")).toBe(7);
    expect(ok("1.250.000")).toBe(125_000_000);
  });

  it("rechaza lo que se puede leer de dos maneras (antes daba 1,25 en vez de 1250)", () => {
    expect(parseCents("1.250").error).toMatch(/dos maneras/);
    expect(parseCents("1,250").error).toMatch(/dos maneras/);
    expect(parseCents("12.500").error).toMatch(/dos maneras/);
  });

  it("rechaza entradas inválidas", () => {
    expect(parseCents("").error).toBeDefined();
    expect(parseCents("abc").error).toBeDefined();
    expect(parseCents("10,555").error).toBeDefined(); // 3 decimales con parte entera > 0 y ceros
    expect(parseCents("0,125").error).toMatch(/2 decimales/);
    expect(parseCents("1250,").error).toBeDefined();
    expect(parseCents("1.2.3").error).toBeDefined();
    expect(parseCents("999999999999").error).toMatch(/grande/);
  });
});

describe("parseDecimal", () => {
  it("acepta coma o punto y limita los decimales", () => {
    expect(parseDecimal("2,5")).toBe(2.5);
    expect(parseDecimal("3")).toBe(3);
    expect(parseDecimal("1.250")).toBeNull();
    expect(parseDecimal("-1")).toBeNull();
    expect(parseDecimal("x")).toBeNull();
  });
});

describe("formato", () => {
  it("imprime siempre dos decimales exactos", () => {
    expect(formatCents(101)).toBe("$1,01");
    expect(formatCents(100)).toBe("$1,00");
    expect(centsToInput(125050)).toBe("1250.50");
    expect(centsToInput(7)).toBe("0.07");
    expect(ok(centsToInput(123456))).toBe(123456); // ida y vuelta
  });
});

describe("IVA y líneas", () => {
  it("desglosa el total sin perder centavos", () => {
    for (const total of [1, 99, 100, 1149, 115000, 999_999_99]) {
      const { subtotal, vat } = splitVat(total, 15);
      expect(subtotal + vat).toBe(total);
    }
    expect(splitVat(11500, 15)).toEqual({ subtotal: 10000, vat: 1500 });
  });

  it("redondea mitades hacia arriba (el caso que fallaba con decimales de JS)", () => {
    // $1,005 no existe en centavos; la mitad más cercana: 3 x $0,335 -> 3 x 33,5c
    expect(lineAmounts(1, 100, 15).total).toBe(115);
    expect(lineAmounts(2.5, 1000, 0).subtotal).toBe(2500);
    expect(lineAmounts(0.5, 1, 0).subtotal).toBe(1); // 0,5 centavos sube a 1
    expect(lineAmounts(0.01, 50, 0).subtotal).toBe(1); // 0,5 -> 1
  });

  it("las filas suman exactamente el total", () => {
    const rows = [
      lineAmounts(3, 333, 15),
      lineAmounts(7, 1999, 15),
      lineAmounts(1.5, 2501, 15),
    ];
    const sum = rows.reduce((s, r) => s + r.total, 0);
    const subtotal = rows.reduce((s, r) => s + r.subtotal, 0);
    const vat = rows.reduce((s, r) => s + r.vat, 0);
    expect(sum).toBe(subtotal + vat);
  });

  it("costo con IVA y precio de venta", () => {
    expect(withVatCents(10000, 15)).toBe(11500);
    expect(salePriceCents(10000, 40)).toBe(14000);
    expect(salePriceCents(10000, 100)).toBe(20000);
    expect(salePriceCents(333, 40)).toBe(466); // 466,2 -> 466
  });
});
