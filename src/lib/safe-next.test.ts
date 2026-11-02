import { describe, expect, it } from "vitest";
import { safeNext } from "./safe-next";

describe("safeNext", () => {
  it("acepta rutas internas", () => {
    expect(safeNext("/acme/contratos?x=1")).toBe("/acme/contratos?x=1");
    expect(safeNext("/invitacion/abc")).toBe("/invitacion/abc");
  });

  it("rechaza destinos externos, incluido el truco de la barra invertida", () => {
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "evil.com", "", "/a\nb", undefined, null, 5]) {
      expect(safeNext(bad)).toBe("/");
    }
  });
});
