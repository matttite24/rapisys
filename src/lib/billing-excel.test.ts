import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildBillingWorkbook, buildConsolidatedWorkbook, type BillingExcelLine } from "./billing-excel";

const line = (over: Partial<BillingExcelLine> = {}): BillingExcelLine => ({
  description: "Filtro", part_number: "F-1", quantity: 2, unit: "unit", referenceCents: 20000, costCents: 11500, sources: 1, unknown: 0, marginOverride: null, excluded: false, ...over,
});

describe("reporte de cobro en Excel", () => {
  it("incluye solo las líneas que cuentan, con margen ajustado, y totales con fórmulas", async () => {
    const buf = await buildBillingWorkbook({
      contract: { code: "C-1", name: "Contrato", client: "Cliente" },
      delivery: { code: "ENT-003", date: "09 nov 2026", dateIso: "2026-11-09", list: "Factura 001", receivedBy: null, voided: false },
      lines: [line({ marginOverride: 40, assets: ["Excavadora CAT (Caterpillar 320)", "Cargadora"] }), line({ description: "Omitida", excluded: true }), line({ description: "Sin compra", sources: 0, costCents: 0 })],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Reporte de cobro")!;
    // Cada fila lleva la fecha de entrega, como fecha real de Excel.
    expect(ws.getCell("B9").value).toBe("Fecha de entrega");
    expect((ws.getCell("B10").value as Date).toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(ws.getCell("D10").value).toBe("Filtro");
    // Activos relacionados con el producto de la línea.
    expect(ws.getCell("E9").value).toBe("Activo");
    expect(ws.getCell("E10").value).toBe("Excavadora CAT (Caterpillar 320); Cargadora");
    expect(ws.getCell("H10").value).toBe(115);
    expect(ws.getCell("I10").value).toBeCloseTo(0.4);
    expect(ws.getCell("J10").value).toBeCloseTo(161);
    expect(ws.getCell("D11").value).toContain("Total · 1 línea");
    expect((ws.getCell("K11").value as { formula: string }).formula).toBe("J11-H11");
  });

  it("exporta solo las columnas elegidas y mantiene los totales", async () => {
    const buf = await buildBillingWorkbook({
      contract: { code: "C-1", name: "Contrato", client: "Cliente" },
      delivery: { code: "ENT-003", date: "09 nov 2026", dateIso: "2026-11-09", list: "Factura 001", receivedBy: null, voided: false },
      lines: [line(), line({ description: "Otro", costCents: 5000, referenceCents: 8000 })],
      columns: ["desc", "cost", "final", "profit"],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Reporte de cobro")!;
    expect([1, 2, 3, 4].map((c) => ws.getCell(9, c).value)).toEqual(["Descripción", "Costo total (c/IVA)", "Valor final", "Utilidad generada"]);
    expect(ws.getCell("A10").value).toBe("Filtro");
    expect((ws.getCell("D10").value as { formula: string }).formula).toBe("C10-B10");
    expect((ws.getCell("B12").value as { formula: string }).formula).toBe("SUM(B10:B11)");
  });

  it("sin costo o sin valor final, la utilidad queda como valor (no fórmula)", async () => {
    const buf = await buildBillingWorkbook({
      contract: { code: "C-1", name: "Contrato", client: "Cliente" },
      delivery: { code: "ENT-003", date: "09 nov 2026", dateIso: "2026-11-09", list: "Factura 001", receivedBy: null, voided: false },
      lines: [line()],
      columns: ["desc", "profit"],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Reporte de cobro")!;
    expect(ws.getCell("B10").value).toBe(85);
    expect(ws.getCell("B11").value).toBe(85);
  });

  it("con una sola columna no falla", async () => {
    const buf = await buildBillingWorkbook({
      contract: { code: "C-1", name: "Contrato", client: "Cliente" },
      delivery: { code: "ENT-003", date: "09 nov 2026", dateIso: "2026-11-09", list: "Factura 001", receivedBy: null, voided: false },
      lines: [line()],
      columns: ["desc"],
    });
    expect(buf.length).toBeGreaterThan(0);
  });
});

describe("consolidado de entregas en Excel", () => {
  const d = (code: string, dateIso: string, lines: BillingExcelLine[]) => ({ code, date: dateIso, dateIso, list: "Factura 001", receivedBy: null, lines });
  const load = async (buf: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    return wb;
  };

  it("hoja Resumen (una fila por entrega, con total) y hoja Detalle (todas las líneas con su entrega)", async () => {
    const wb = await load(await buildConsolidatedWorkbook({
      contract: { code: "C-1", name: "Contrato", client: "Cliente" },
      deliveries: [
        d("ENT-001", "2026-11-05", [line({ marginOverride: 40 }), line({ description: "Omitida", excluded: true })]),
        d("ENT-002", "2026-11-09", [line({ description: "Otro", costCents: 5000, referenceCents: 8000 })]),
      ],
    }));
    const rs = wb.getWorksheet("Resumen")!;
    expect(rs.getCell("A7").value).toBe("ENT-001");
    expect(rs.getCell("D7").value).toBe(1);
    expect(rs.getCell("E7").value).toBe(1);
    expect(rs.getCell("F7").value).toBe(115);
    expect(rs.getCell("H7").value).toBeCloseTo(161);
    expect(rs.getCell("A8").value).toBe("ENT-002");
    expect(rs.getCell("A9").value).toContain("Total · 2 entregas");
    expect((rs.getCell("F9").value as { formula: string }).formula).toBe("SUM(F7:F8)");

    const det = wb.getWorksheet("Detalle")!;
    // Columnas por defecto: N.º, Entrega, Fecha de entrega, …
    expect(det.getCell("B6").value).toBe("Entrega");
    expect(det.getCell("B7").value).toBe("ENT-001");
    expect(det.getCell("B8").value).toBe("ENT-002");
    expect((det.getCell("C8").value as Date).toISOString().slice(0, 10)).toBe("2026-11-09");
    expect(det.autoFilter).toBeTruthy();
  });

  it("sin entregas no falla", async () => {
    const buf = await buildConsolidatedWorkbook({ contract: { code: "C-1", name: "Contrato", client: "Cliente" }, deliveries: [] });
    expect(buf.length).toBeGreaterThan(0);
  });
});
