// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSupplyFilter } from "./use-supply-filter";
import type { SupplyState } from "./supply-progress";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const path = "/org/contratos/id/abastecimiento";
const pending = { id: "1", state: "pending" as SupplyState };
const quoted = { id: "2", state: "quoted" as SupplyState };
const counts = { pending: 1, quoted: 1, purchased: 0, partial: 0, in_stock: 0, delivered: 0 };
const input = { lines: [pending, quoted], total: 2, page: 1, estado: "" as SupplyState | "", counts, activeId: "list", q: "", basePath: path };
const url = (state: string) => `${path}?lista=list${state ? `&estado=${state}` : ""}`;
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", url("")); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("cambio local de filtros de abastecimiento", () => {
  it("filtra lista completa y vuelve a Todas sin pedir datos al servidor", () => {
    const { result } = renderHook(() => useSupplyFilter(input));
    act(() => { expect(result.current.select("quoted", url("quoted"))).toBe(true); });
    expect(result.current.lines).toEqual([quoted]);
    expect(result.current.total).toBe(1);
    expect(window.location.search).toContain("estado=quoted");
    act(() => { result.current.select("", url("")); });
    expect(result.current.lines).toEqual(input.lines);
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("muestra estados vacíos sin consultar ni perder página anterior", () => {
    const data = { ...input, lines: [pending], total: 50, estado: "pending" as const, counts: { ...counts, pending: 50 } };
    const { result } = renderHook(() => useSupplyFilter(data));
    act(() => { expect(result.current.select("purchased", url("purchased"))).toBe(true); });
    expect(result.current.lines).toEqual([]);
    expect(result.current.total).toBe(0);
    act(() => { result.current.select("pending", url("pending")); });
    expect(result.current.lines).toEqual([pending]);
    expect(result.current.total).toBe(50);
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("exige servidor para estados no vacíos cuando solo hay una página parcial", () => {
    const { result } = renderHook(() => useSupplyFilter({ ...input, total: 60 }));
    act(() => { expect(result.current.select("quoted", url("quoted"))).toBe(false); });
    expect(result.current.lines).toEqual(input.lines);
    expect(window.location.search).not.toContain("estado");
  });
  it("no trata resultado vacío de búsqueda en un estado como prueba de que otros están vacíos", () => {
    const { result } = renderHook(() => useSupplyFilter({ ...input, lines: [], total: 0, estado: "pending", q: "correa" }));
    expect(result.current.select("quoted", url("quoted"))).toBe(false);
  });
  it("invalida resultados locales tras recibir datos actualizados", () => {
    const { result, rerender } = renderHook((props) => useSupplyFilter(props), { initialProps: input });
    act(() => { result.current.select("pending", url("pending")); });
    expect(result.current.estado).toBe("pending");
    const updated = { ...quoted, state: "purchased" as SupplyState };
    rerender({ ...input, lines: [pending, updated] });
    expect(result.current.estado).toBe("");
    expect(result.current.lines).toEqual([pending, updated]);
  });
  it("restaura filtro con historial y evita entradas duplicadas", () => {
    const push = vi.spyOn(window.history, "pushState");
    const { result } = renderHook(() => useSupplyFilter(input));
    act(() => { result.current.select("", url("")); });
    expect(push).not.toHaveBeenCalled();
    act(() => { result.current.select("quoted", url("quoted")); });
    act(() => {
      window.history.replaceState(null, "", url(""));
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(result.current.lines).toEqual(input.lines);
    expect(result.current.estado).toBe("");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
