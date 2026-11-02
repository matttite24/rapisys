import { describe, expect, it } from "vitest";
import { addDaysIso, formatIso } from "./dates";

describe("addDaysIso", () => {
  it("suma días cruzando meses y años", () => {
    expect(addDaysIso("2026-01-31", 30)).toBe("2026-03-02");
    expect(addDaysIso("2026-12-20", 15)).toBe("2027-01-04");
    expect(addDaysIso("2026-11-05", 0)).toBe("2026-11-05");
  });

  it("respeta los años bisiestos", () => {
    expect(addDaysIso("2024-02-28", 2)).toBe("2024-03-01");
    expect(addDaysIso("2026-02-28", 2)).toBe("2026-03-02");
  });

  it("no cambia con el cambio de hora", () => {
    expect(addDaysIso("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDaysIso("2026-10-30", 3)).toBe("2026-11-02");
  });

  it("devuelve null con datos inválidos", () => {
    expect(addDaysIso("", 10)).toBeNull();
    expect(addDaysIso("2026-11-05", Number.NaN)).toBeNull();
    expect(addDaysIso("2026-11-05", 1.5)).toBeNull();
    expect(addDaysIso("2026-11-05", -1)).toBeNull();
  });
});

describe("formatIso", () => {
  it("da formato legible y no corre el día", () => {
    expect(formatIso("2026-11-05")).toMatch(/05.*nov.*2026/i);
    expect(formatIso("2026-01-01")).toMatch(/01.*ene.*2026/i);
  });
});
