import { expect, it, vi } from "vitest";
import { activeNavigationHref, contractFilter } from "./contract-filters";
import { redirectContractFilter } from "./redirect-contract-filter";
import { redirect } from "next/navigation";
vi.mock("next/navigation", () => ({ redirect: vi.fn((href: string) => { throw new Error(href); }) }));
it("marca solo el filtro activo sin confundirlo con Todos o con otra sección", () => {
  const hrefs = ["/contratos", "/contratos?estado=nuevos", "/contratos?estado=ejecucion", "/contratos?estado=cierre", "/contratos?estado=cobrados"];
  expect(activeNavigationHref("/contratos", hrefs, new URLSearchParams("estado=ejecucion&q=motor"))).toBe("/contratos?estado=ejecucion");
  expect(activeNavigationHref("/contratos", hrefs, new URLSearchParams())).toBe("/contratos");
  expect(activeNavigationHref("/bodega/activos/nuevo", ["/bodega", "/bodega/activos"], new URLSearchParams())).toBe("/bodega/activos");
  expect(activeNavigationHref("/bodega/activos/123", ["/bodega", "/bodega?vista=activos"], new URLSearchParams())).toBe("/bodega?vista=activos");
  expect(contractFilter("invalid")).toBe("");
});
it("conserva búsqueda y página de enlaces antiguos al redirigir al filtro", async () => {
  await expect(redirectContractFilter(Promise.resolve({ org: "org" }), Promise.resolve({ q: "motor", page: "2" }), "cierre")).rejects.toThrow("/org/contratos?q=motor&page=2&estado=cierre");
  expect(redirect).toHaveBeenCalledWith("/org/contratos?q=motor&page=2&estado=cierre");
});
