import { describe, expect, it } from "vitest";
import { parseCents } from "./money";
import { canonicalOf, formatTyped, fromCanonical, parseTyped } from "./money-format";

const show = (text: string) => formatTyped(parseTyped(text));
const canon = (text: string) => canonicalOf(parseTyped(text));

describe("agrupa miles al escribir", () => {
  it("separa miles y millones", () => {
    expect(show("1250")).toBe("1.250");
    expect(show("1250000")).toBe("1.250.000");
    expect(show("999")).toBe("999");
    expect(show("12")).toBe("12");
  });

  it("usa coma decimal y limita a 2 decimales", () => {
    expect(show("1250000,5")).toBe("1.250.000,5");
    expect(show("1250,567")).toBe("1.250,56");
    expect(show("0,05")).toBe("0,05");
    expect(show("1250,")).toBe("1.250,"); // permite seguir escribiendo decimales
  });

  it("acepta el punto como decimal y lo convierte", () => {
    expect(show("1250.5")).toBe("1.250,5");
    expect(show("1250.")).toBe("1.250,");
    expect(show(".5")).toBe("0,5");
  });

  it("reconoce lo ya formateado y los pegados con miles", () => {
    expect(show("1.250.000")).toBe("1.250.000");
    expect(show("1.250,50")).toBe("1.250,50");
    expect(show("1,250.50")).toBe("1.250,50"); // formato estadounidense: el último separador es el decimal
  });

  it("quita ceros a la izquierda, letras y limita las cifras", () => {
    expect(show("007")).toBe("7");
    expect(show("$ 12abc")).toBe("12");
    expect(show("1234567890123")).toBe("12.345.678");
    expect(show("")).toBe("");
  });
});

describe("valor que se envía (canónico)", () => {
  it("no lleva miles y usa punto decimal", () => {
    expect(canon("1.250.000,50")).toBe("1250000.50");
    expect(canon("1250,5")).toBe("1250.5");
    expect(canon("1250,")).toBe("1250");
    expect(canon("")).toBe("");
  });

  it("siempre lo lee parseCents sin ambigüedad", () => {
    for (const text of ["1250", "1.250", "1.250.000", "1250,5", "0,05", "12,34", "99.999.999,99", "1250,"]) {
      const c = parseCents(canon(text));
      expect(c.ok, text).toBe(true);
    }
    expect(parseCents(canon("1.250")).cents).toBe(125000); // antes daba 125 centavos
    expect(parseCents(canon("1.250.000,50")).cents).toBe(125_000_050);
  });

  it("ida y vuelta con un valor ya guardado", () => {
    expect(formatTyped(fromCanonical("1250.5"))).toBe("1.250,5");
    expect(formatTyped(fromCanonical("1250"))).toBe("1.250");
    expect(canonicalOf(fromCanonical("1250.50"))).toBe("1250.50");
    expect(fromCanonical("")).toEqual({ int: "", frac: "", decimal: false });
  });
});
