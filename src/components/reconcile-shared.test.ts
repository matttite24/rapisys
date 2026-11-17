import { expect, it } from "vitest";
import { lineMatches } from "./reconcile-shared";

const line = { name: "Correa tensionadora", tdrName: "BELT TENSIONER", code: "1R-0716", sku: "SKU-9", partNumbers: ["236-8228"] };

it("busca por palabras en cualquier orden, sin acentos ni signos", () => {
  expect(lineMatches(line, "")).toBe(true);
  expect(lineMatches(line, "tensionadora correa")).toBe(true);
  expect(lineMatches(line, "TENSIÓN")).toBe(true);
  expect(lineMatches(line, "1r0716")).toBe(true);
  expect(lineMatches(line, "1r 0716")).toBe(true);
  expect(lineMatches(line, "2368228")).toBe(true);
  expect(lineMatches(line, "belt")).toBe(true);
  expect(lineMatches(line, "correa filtro")).toBe(false);
});
