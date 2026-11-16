import { expect, it } from "vitest";
import { applyMapping, cleanNumber, gridFromWords, guessMapping, looksLikeHeader, normalizeGrid, unitKey } from "@/lib/table-map";

it("reconoce encabezados y sugiere el mapeo sin repetir campos", () => {
  const head = ["ITEM", "PART. NUM", "DESCRIPCIÓN", "CANTID.", "P. TOTAL", "Cantidad"];
  expect(looksLikeHeader(head)).toBe(true);
  expect(guessMapping(head)).toEqual([null, "part", "description", "quantity", "price", null]);
  expect(looksLikeHeader(["1", "ABC-1", "Filtro", "2"])).toBe(false);
});

it("normaliza números y unidades", () => {
  expect(cleanNumber("1.234,50")).toBe("1234.50");
  expect(cleanNumber("1,234.50")).toBe("1234.50");
  expect(cleanNumber("$ 12,5")).toBe("12.5");
  expect(cleanNumber("1.234")).toBe("1234");
  expect(unitKey("Juego")).toBe("set");
  expect(unitKey("lts")).toBe("liter");
  expect(unitKey("raro")).toBe("unit");
});

it("aplica el mapeo, salta filas y marca las incompletas", () => {
  const grid = normalizeGrid([["ITEM", "REF", "DETALLE", "CANT"], ["1", "A-1", "Filtro de aceite", "2"], ["2", "A-2", "", ""], ["3", "A-3", "Bujía", "4"]]);
  const rows = applyMapping(grid, [null, "part", "description", "quantity"], (i) => i > 0 && i !== 3);
  expect(rows).toHaveLength(2);
  expect(rows[0]).toMatchObject({ part: "A-1", description: "Filtro de aceite", quantity: "2", unit: "unit", review: false });
  expect(rows[1].review).toBe(true);
});

it("arma la tabla desde palabras con posición, por líneas verticales o por huecos", () => {
  const w = (text: string, x0: number, y: number) => ({ text, confidence: 90, x0, x1: x0 + text.length * 8, y0: y, y1: y + 10 });
  const words = [w("PARTE", 10, 0), w("DESCRIPCION", 100, 0), w("CANT", 300, 0), w("A-1", 10, 30), w("Filtro", 100, 30), w("de", 160, 30), w("aceite", 185, 30), w("2", 300, 30)];
  const byGaps = gridFromWords(words, []);
  expect(byGaps[1]).toEqual(["A-1", "Filtro de aceite", "2"]);
  const byBorders = gridFromWords(words, [5, 90, 280, 400]);
  expect(byBorders[1].filter(Boolean)).toContain("Filtro de aceite");
});
