import { describe, expect, it } from "vitest";
import { findDuplicates } from "./duplicates";

const r = (part: string, description = "X") => ({ part, description });

describe("findDuplicates", () => {
  it("marca la repetición, no la primera aparición", () => {
    expect(findDuplicates([r("9L-2526"), r("135-2650"), r("9L-2526")], [])).toEqual([
      null,
      null,
      { kind: "batch", ref: 1 },
    ]);
  });

  it("ignora mayúsculas, espacios y guiones del número de parte", () => {
    const d = findDuplicates([r("3E-8017"), r(" 3e 8017 ")], []);
    expect(d[1]).toEqual({ kind: "batch", ref: 1 });
  });

  it("detecta lo que la lista ya tiene", () => {
    const d = findDuplicates([r("7C-7431")], [r("135-2650"), r("7C7431")]);
    expect(d[0]).toEqual({ kind: "existing", ref: 2 });
  });

  it("sin número de parte compara la descripción", () => {
    const d = findDuplicates([r("", "Filtro de aceite"), r("", "FILTRO  DE ACEITE"), r("", "Otro")], []);
    expect(d.map((x) => x?.kind ?? null)).toEqual([null, "batch", null]);
  });

  it("no confunde un número de parte con una descripción igual", () => {
    expect(findDuplicates([r("ABC", "Sello"), r("", "ABC")], [])).toEqual([null, null]);
  });

  it("las filas vacías no cuentan como duplicadas", () => {
    expect(findDuplicates([r("", ""), r("", "")], [])).toEqual([null, null]);
  });
});
