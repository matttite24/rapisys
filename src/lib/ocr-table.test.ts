import { describe, expect, it } from "vitest";
import { groupWords, parseTable, type OcrWord } from "./ocr-table";

const line = (text: string, confidence = 95) => ({ text, confidence });

describe("parseTable", () => {
  it("lee las filas de la tabla del contrato", () => {
    const { rows, skipped } = parseTable([
      line("MODELO: 120H"),
      line("ITEM PART. NUM DESCRIPCIÓN CANTID. CPC"),
      line("1 9L-2526 V-BELT SET (INCLUDES 3 BELTS) 1 444210112"),
      line("2 135-2650 TURBOCHARGER GP 1 444210112"),
      line("3 3E-8017 LOCKNUT 4 444210112"),
      line("4 7C-7431 GASKET-TURBOCHARGER 1 444210112"),
      line("RETROEXCAVADORA 420F"),
    ]);
    expect(rows.map((r) => [r.part, r.description, r.quantity, r.cpc])).toEqual([
      ["9L-2526", "V-BELT SET (INCLUDES 3 BELTS)", "1", "444210112"],
      ["135-2650", "TURBOCHARGER GP", "1", "444210112"],
      ["3E-8017", "LOCKNUT", "4", "444210112"],
      ["7C-7431", "GASKET-TURBOCHARGER", "1", "444210112"],
    ]);
    expect(rows.every((r) => !r.review)).toBe(true);
    expect(skipped).toBe(3); // modelo, encabezado y nombre del activo
  });

  it("lee el resultado real del OCR de la tabla de ejemplo (modo una columna)", () => {
    const { rows } = parseTable([
      line("ITEM PART. NUM DESCRIPCION CANTID. CPC", 94),
      line("1 9L-2526 V-BELT SET (INCLUDES 3 BELTS) 1 444210112", 93),
      line("2 135-2650 TURBOCHARGER GP 1 444210112", 95),
      line("3 3E-8017 LOCKNUT 4 444210112", 93),
      line("7C-7431 GASKET-TURBOCHARGER 1 444210112", 93), // el OCR perdió el número de ítem
    ]);
    expect(rows.map((r) => [r.part, r.description, r.quantity, r.review])).toEqual([
      ["9L-2526", "V-BELT SET (INCLUDES 3 BELTS)", "1", false],
      ["135-2650", "TURBOCHARGER GP", "1", false],
      ["3E-8017", "LOCKNUT", "4", false],
      ["7C-7431", "GASKET-TURBOCHARGER", "1", true],
    ]);
  });

  it("ignora los bordes de la tabla que el OCR lee como símbolos", () => {
    const { rows } = parseTable([line("| 3 | 3E-8017 | LOCKNUT | 4 | 444210112 |")]);
    expect(rows[0]).toMatchObject({ part: "3E-8017", description: "LOCKNUT", quantity: "4" });
  });

  it("marca para revisar las filas con poca confianza", () => {
    const { rows } = parseTable([line("3 3E-80I7 LOCKNUT 4 444210112", 62)]);
    expect(rows[0].review).toBe(true);
  });

  it("acepta filas sin CPC o sin número de ítem, pero las marca", () => {
    const noCpc = parseTable([line("3 3E-8017 LOCKNUT 4")]).rows[0];
    expect(noCpc).toMatchObject({ part: "3E-8017", quantity: "4", cpc: "", review: true });
    const noItem = parseTable([line("3E-8017 LOCKNUT 4 444210112")]).rows[0];
    expect(noItem).toMatchObject({ part: "3E-8017", description: "LOCKNUT", review: true });
  });

  it("deja para corregir a mano la fila que empieza con su número pero no calza", () => {
    const { rows } = parseTable([line("5 FILTRO DE ACEITE ILEGIBLE")]);
    expect(rows[0]).toMatchObject({ part: "", description: "FILTRO DE ACEITE ILEGIBLE", quantity: "1", review: true });
  });

  it("normaliza la coma decimal", () => {
    expect(parseTable([line("1 AB-123 ACEITE 2,5 444210112")]).rows[0].quantity).toBe("2.5");
  });
});

describe("groupWords", () => {
  const w = (text: string, x0: number, y0: number): OcrWord => ({ text, confidence: 90, x0, x1: x0 + 40, y0, y1: y0 + 20 });

  it("junta en un renglón las palabras a la misma altura, ordenadas de izquierda a derecha", () => {
    const lines = groupWords([w("LOCKNUT", 200, 102), w("3", 10, 100), w("3E-8017", 100, 99), w("A", 10, 200)]);
    expect(lines.map((l) => l.text)).toEqual(["3 3E-8017 LOCKNUT", "A"]);
  });

  it("devuelve vacío sin palabras", () => {
    expect(groupWords([])).toEqual([]);
  });
});
