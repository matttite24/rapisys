import { expect, it } from "vitest";
import { gridFromPdfItems, type PdfItem } from "./pdf-table";

const cell = (text: string, x: number, y: number, width = 60): PdfItem => ({ text, x, y, width, height: 9 });
const row = (y: number, part: string, desc: string, qty: string) => [cell(part, 20, y), cell(desc, 120, y, 160), cell(qty, 320, y, 20)];

it("arma la tabla desde el texto del PDF, apila páginas y quita encabezados repetidos", () => {
  const head = (y: number) => [cell("PART. NUM", 20, y), cell("DESCRIPCIÓN", 120, y, 160), cell("CANTIDAD", 320, y, 40)];
  const grid = gridFromPdfItems([
    { height: 800, items: [cell("CLÁUSULA PRIMERA OBJETO DEL CONTRATO ADQUISICIÓN DE REPUESTOS PARA LA MAQUINARIA", 20, 780, 330), ...head(760), ...row(740, "AB-Z123", "BELT TENSIONER", "2"), ...row(720, "236-8228", "PUMP FUEL", "1")] },
    { height: 800, items: [...head(760), ...row(740, "1R-0716", "FILTER", "4")] },
  ]);
  expect(grid.map((r) => r.join(" | "))).toEqual([
    " | CLÁUSULA PRIMERA OBJETO DEL CONTRATO ADQUISICIÓN DE REPUESTOS PARA LA MAQUINARIA | ",
    "PART. NUM | DESCRIPCIÓN | CANTIDAD",
    "AB-Z123 | BELT TENSIONER | 2",
    "236-8228 | PUMP FUEL | 1",
    "1R-0716 | FILTER | 4",
  ]);
});

import { looksLikeListPage, parsePageRange } from "./pdf-table";

it("lee rangos de páginas", () => {
  expect(parsePageRange("1-3, 8, 10-11", 12)).toEqual([1, 2, 3, 8, 10, 11]);
  expect(parsePageRange("3,3,2", 5)).toEqual([2, 3]);
  expect(parsePageRange("0", 5)).toBeNull();
  expect(parsePageRange("4-9", 5)).toBeNull();
  expect(parsePageRange("a", 5)).toBeNull();
  expect(parsePageRange("", 5)).toBeNull();
});

it("reconoce las páginas con tabla de ítems", () => {
  expect(looksLikeListPage("N.º PART. NUM DESCRIPCIÓN CANTIDAD UNIDAD")).toBe(true);
  expect(looksLikeListPage("Cláusula primera: objeto del contrato")).toBe(false);
});
