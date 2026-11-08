import { describe, expect, it } from "vitest";
import { parseExpense } from "./expenses";
const form = (extra: Record<string, string> = {}) => {
  const data = new FormData();
  for (const [key, value] of Object.entries({ spent_on: "2026-11-08", payment_method: "cash", lines: JSON.stringify([{ concept: "  Taxi a bodega  ", category: "transport", amount: "12,50" }]), ...extra })) data.set(key, value);
  return data;
};
const detail = (amount: string, concept = "Taxi") => JSON.stringify([{ concept, category: "transport", amount }]);
describe("documentos de gastos", () => {
  it("valida varias líneas, convierte a centavos y recorta conceptos", () => {
    expect(parseExpense(form()).values).toMatchObject({ lines: [{ concept: "Taxi a bodega", amount_cents: 1250, category: "transport" }], spent_on: "2026-11-08" });
    expect(parseExpense(form({ lines: JSON.stringify([{ concept: "Comida", category: "food", amount: "10,50" }, { concept: "Taxi", category: "transport", amount: "5,25" }]) })).values?.lines).toHaveLength(2);
  });
  it("muestra errores por línea junto con errores del documento", () => {
    expect(parseExpense(form({ lines: JSON.stringify([{ concept: " ", amount: "0", category: "invalid" }]), spent_on: "2026-02-30", payment_method: "" })).fields).toEqual({
      "lines.0.concept": expect.any(String), "lines.0.amount": expect.any(String), "lines.0.category": expect.any(String), spent_on: expect.any(String), payment_method: expect.any(String),
    });
  });
  it("rechaza fechas inexistentes y montos ambiguos sin transformar importes", () => {
    expect(parseExpense(form({ spent_on: "2025-02-29" })).fields?.spent_on).toBeTruthy();
    expect(parseExpense(form({ spent_on: "2024-02-29", lines: detail("1.250,50") })).values?.lines[0].amount_cents).toBe(125050);
    expect(parseExpense(form({ lines: detail("-1") })).fields?.["lines.0.amount"]).toBeTruthy();
    expect(parseExpense(form({ lines: detail("1.250") })).fields?.["lines.0.amount"]).toBeTruthy();
  });
  it("solo acepta enlaces web y limita textos", () => {
    expect(parseExpense(form({ document_url: "javascript:alert(1)", notes: "x".repeat(2001), payee: "x".repeat(201) })).fields).toMatchObject({ document_url: expect.any(String), notes: expect.any(String), payee: expect.any(String) });
    expect(parseExpense(form({ document_url: "https://example.com/recibo.pdf" })).values?.document_url).toBe("https://example.com/recibo.pdf");
  });
  it("exige detalle no vacío y limita cantidad de líneas y total del documento", () => {
    for (const lines of ["[]", "null", "invalid", JSON.stringify(Array.from({ length: 101 }, () => ({ concept: "Taxi", category: "transport", amount: "1" })))]) {
      expect(parseExpense(form({ lines })).fields?.lines).toBeTruthy();
    }
    expect(parseExpense(form({ lines: JSON.stringify([{ concept: "A", category: "other", amount: "100000000" }, { concept: "B", category: "other", amount: "1" }]) })).fields?.lines).toBeTruthy();
  });
});
