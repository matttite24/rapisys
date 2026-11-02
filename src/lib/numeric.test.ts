import { describe, expect, it } from "vitest";
import { digitsOnly, sanitizeDecimal } from "./numeric";

describe("digitsOnly", () => {
  it("deja solo dígitos y respeta el largo", () => {
    expect(digitsOnly("12ab-3.4")).toBe("1234");
    expect(digitsOnly("1792345678001999", 13)).toBe("1792345678001");
    expect(digitsOnly("e+")).toBe("");
  });
});

describe("sanitizeDecimal", () => {
  it("acepta un solo separador y limita los decimales", () => {
    expect(sanitizeDecimal("12")).toBe("12");
    expect(sanitizeDecimal("2,5")).toBe("2,5");
    expect(sanitizeDecimal("0.25")).toBe("0.25");
    expect(sanitizeDecimal("1,2,3")).toBe("1,23");
    expect(sanitizeDecimal("3.456")).toBe("3.45");
    expect(sanitizeDecimal("-5e3")).toBe("53");
    expect(sanitizeDecimal("abc")).toBe("");
    expect(sanitizeDecimal("7,5", 0)).toBe("7");
  });
});
