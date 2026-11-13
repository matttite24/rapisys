import { describe, expect, it } from "vitest";
import { buildRows, readItemsCsv, splitCsv, TEMPLATE, type ColumnKey } from "./item-csv";

describe("splitCsv", () => {
  it("detecta punto y coma y respeta comillas", () => {
    expect(splitCsv('Nombre;Línea\n"Filtro; de aceite";"Dice ""hola"""\n')).toEqual([["Nombre", "Línea"], ["Filtro; de aceite", 'Dice "hola"']]);
  });
  it("lee comas, saltos CRLF y BOM", () => {
    expect(splitCsv("﻿a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("plantilla", () => {
  it("tiene las columnas en el orden del sistema anterior", () => {
    expect(TEMPLATE.trim()).toBe("Código interno;SKU;Referencia del fabricante;Código de barras;Nombre;Descripción;Saldo;Unidad de medida;Precio al por menor;Precio de compra;NOMBRE TDR");
  });
  it("la plantilla vacía se lee como encabezado válido", () => {
    expect(readItemsCsv(TEMPLATE + "A1;S1;R1;B1;Filtro;Desc;5;UND;12,50;8,00;FILTRO TDR\n").present).toHaveLength(11);
  });
});

describe("readItemsCsv / buildRows", () => {
  const csv = [
    "Código interno;SKU;Referencia del fabricante;Código de barras;Nombre;Descripción;Saldo;Unidad de medida;Precio al por menor;Precio de compra;NOMBRE TDR",
    "A1;F-1;1R-0716;7501;Filtro de aceite;Para 120H;5;UND;12,50;8,00;FILTRO ACEITE MOTOR",
    "A2;;;;;;;;;;",
    "A3;F-1;;;Otro;;;;abc;;",
  ].join("\n");
  const all = new Set<ColumnKey>(["internalCode", "sku", "partRef", "barcode", "name", "description", "unit", "tdrName"]);

  it("lee todas las columnas y filas", () => {
    const { present, rows } = readItemsCsv(csv);
    expect(present).toHaveLength(11);
    expect(rows[0]).toMatchObject({ internalCode: "A1", partRef: "1R-0716", tdrName: "FILTRO ACEITE MOTOR", balance: "5", cost: "8,00" });
  });
  it("carga las columnas elegidas y marca los problemas; los precios no se validan", () => {
    const rows = buildRows(readItemsCsv(csv).rows, all);
    expect(rows[0]).toMatchObject({ internalCode: "A1", sku: "F-1", unit: "UND", tdrName: "FILTRO ACEITE MOTOR" });
    expect(rows[1].error).toBe("Falta el nombre.");
    expect(rows[2].error).toBe("SKU repetido en el archivo."); // el precio "abc" no genera error
  });
  it("lo no elegido queda vacío y no da errores (SKU repetido, precio inválido)", () => {
    const rows = buildRows(readItemsCsv(csv).rows, new Set<ColumnKey>(["name", "tdrName"]));
    expect(rows[0]).toMatchObject({ internalCode: "", sku: "", tdrName: "FILTRO ACEITE MOTOR" });
    expect(rows[2].error).toBeUndefined();
  });
  it("exige la columna Nombre", () => {
    expect(readItemsCsv("SKU\nA").error).toMatch(/Nombre/);
  });
});

