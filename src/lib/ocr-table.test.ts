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
    expect(skipped).toBe(2); // modelo y encabezado (el nombre del activo es una sección)
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

  it("si el OCR pierde la cantidad, deja la fila para completarla", () => {
    const { rows } = parseTable([line("9L-2526 V-BELT SET (INCLUDES 3 BELTS) 444210112")]);
    expect(rows[0]).toMatchObject({ part: "9L-2526", description: "V-BELT SET (INCLUDES 3 BELTS)", quantity: "", cpc: "444210112", review: true });
  });

  it("deja para corregir a mano la fila que empieza con su número pero no calza", () => {
    const { rows } = parseTable([line("5 FILTRO DE ACEITE ILEGIBLE")]);
    expect(rows[0]).toMatchObject({ part: "", description: "FILTRO DE ACEITE ILEGIBLE", quantity: "1", review: true });
  });

  it("normaliza la coma decimal", () => {
    expect(parseTable([line("1 AB-123 ACEITE 2,5 444210112")]).rows[0].quantity).toBe("2.5");
  });
});

describe("parseTable con precios", () => {
  it("lee descripción, parte, cantidad y toma el P. TOTAL (último importe)", () => {
    const { rows } = parseTable([
      line("ITEM DESCRIPCIÓN DEL PRODUCTO N° DE PARTE CANTIDAD PROFORMA 1 PROFORMA 2"),
      line("3 LOCKNUT 3E-8017 4 $4.86 $4.76 $4.81 $19.24"),
      line("2 TURBOCHARGER GP 135-2650 1 $3,190.56 $3,128.00 $3,159.28 $3,159.28"),
      line("18 WASHER-HARD (17X32X3,5MM THK) 8T-4122 12 $1.66 $1.63 $1.65 $19.74"),
    ]);
    expect(rows.map((r) => [r.part, r.description, r.quantity, r.price])).toEqual([
      ["3E-8017", "LOCKNUT", "4", "19.24"],
      ["135-2650", "TURBOCHARGER GP", "1", "3159.28"],
      ["8T-4122", "WASHER-HARD (17X32X3,5MM THK)", "12", "19.74"],
    ]);
  });
});

describe("parseTable formato estándar (coma decimal)", () => {
  it("lee la planilla estándar y salta los títulos de equipo", () => {
    const { rows, skipped } = parseTable([
      line("ITEM DESCRIPCIÓN DEL PRODUCTO N° DE PARTE CANTIDAD P.UNIT P. TOTAL"),
      line("MOTONIVELADORA CATERPILLAR 120H"),
      line("1 V-BELT SET (INCLUDES 3 BELTS) 9L-2526 1 $117,00 $117,00"),
      line("2 TURBOCHARGER GP 135-2650 1 $3.000,00 $3.000,00"),
      line("3 LOCKNUT 3E-8017 4 $4,50 $18,00"),
      line("5 PUMP-GP-FUEL INJECTION 236-8228 1 $4.550,00 $4.550,00"),
      line("9 KIT-RECEPTACLE (2PIN) 102-8802 24 $7,55 $181,20"),
    ]);
    expect(rows.map((r) => [r.part, r.quantity, r.price])).toEqual([
      ["9L-2526", "1", "117.00"],
      ["135-2650", "1", "3000.00"],
      ["3E-8017", "4", "18.00"],
      ["236-8228", "1", "4550.00"],
      ["102-8802", "24", "181.20"],
    ]);
    expect(skipped).toBe(1);
    expect(rows.map((r) => r.group)).toEqual(Array(5).fill("MOTONIVELADORA CATERPILLAR 120H"));
  });

  it("asigna a cada fila la sección que la antecede", () => {
    const { rows } = parseTable([
      line("MOTONIVELADORA CATERPILLAR 120H"),
      line("4 GASKET-TURBOCHARGER 7C-7431 1 $36,50 $36,50"),
      line("RETROEXCAVADORA 420F"),
      line("5 STRAINER (FUEL TANK) 390-0908 3 $195,00 $585,00"),
    ]);
    expect(rows.map((r) => r.group)).toEqual(["MOTONIVELADORA CATERPILLAR 120H", "RETROEXCAVADORA 420F"]);
  });
});

describe("parseTable con importes mal leídos", () => {
  it("toma el P. TOTAL aunque falte o cambie el $ o sobren espacios", () => {
    const { rows } = parseTable([
      line("6 STRAINER (FUEL TANK) 390-0908 3 $195,00 585,00"),
      line("7 BELT TENSIONER 377-9087 1 S234,00 $ 234,00"),
      line("BELT TENSIONER 377-9087 2 $234,00 $468,00"),
    ]);
    expect(rows.map((r) => [r.part, r.quantity, r.price])).toEqual([
      ["390-0908", "3", "585.00"],
      ["377-9087", "1", "234.00"],
      ["377-9087", "2", "468.00"],
    ]);
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
