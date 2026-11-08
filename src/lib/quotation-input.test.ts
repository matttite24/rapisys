import { describe, expect, it } from "vitest";
import { readQuotation } from "./quotation-input";

const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
};

describe("registro de gestiones de cotización", () => {
  it("permite iniciar la búsqueda sin precio ni proveedor", () => {
    const result = readQuotation(form({ note: "  Consultar disponibilidad mañana  " }));
    expect(result.values?.note).toBe("Consultar disponibilidad mañana");
    expect(result.values?.unitCostCents).toBeNull();
  });
  it("guarda precio en centavos, incluyendo ofertas de costo cero", () => {
    expect(readQuotation(form({ note: "Respondió", unitCost: "125,50" })).values?.unitCostCents).toBe(12550);
    expect(readQuotation(form({ note: "Garantía", unitCost: "0" })).values?.unitCostCents).toBe(0);
  });
  it("rechaza registros vacíos, montos ambiguos y textos demasiado largos", () => {
    expect(readQuotation(form({ note: "  " })).error).toBeTruthy();
    expect(readQuotation(form({ note: "Precio", unitCost: "1.250" })).error).toBeTruthy();
    expect(readQuotation(form({ note: "x".repeat(5001) })).error).toBeTruthy();
  });
  it("permite enlaces web y rechaza protocolos ejecutables", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,test", "https://ejemplo.com/un archivo", "no es enlace"]) {
      expect(readQuotation(form({ note: "Proforma", proformaUrl: url })).error).toBeTruthy();
    }
    expect(readQuotation(form({ note: "Proforma", proformaUrl: "https://ejemplo.com/proforma.pdf" })).values).toBeTruthy();
  });
});
