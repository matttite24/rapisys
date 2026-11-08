// @vitest-environment jsdom
import React from "react";
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useContractFilter } from "./use-contract-filter";
import { ListFilterNavigationProvider } from "./list-filter-navigation";
import { loadContractList } from "@/lib/contract-list-data";
import type { ContractListView, ContractRow } from "@/lib/contract-filters";
vi.mock("@/lib/contract-list-data", () => ({ loadContractList: vi.fn() }));
const rows: ContractRow[] = ["new", "in_progress", "finished", "invoiced", "pending_payment", "paid"].map((status, i) => ({ id: String(i), code: `C${i}`, name: status, status, total_cents: 100, term_days: 10, start_date: "2026-11-08", clients: null, contract_managers: null }));
const initial: ContractListView = { rows, total: 6, filter: "", page: 1, q: "" };
const partial = { ...initial, total: 100 };
const wrapper = ({ children }: { children: React.ReactNode }) => <ListFilterNavigationProvider>{children}</ListFilterNavigationProvider>;
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/org/contratos"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("Todos, Nuevos, En ejecución, Por cobrar y Cobrados filtran datos completos sin cargar", async () => {
  const { result } = renderHook(() => useContractFilter("org", initial), { wrapper });
  for (const [filter, statuses] of [["nuevos", ["new"]], ["ejecucion", ["in_progress"]], ["cierre", ["finished", "invoiced", "pending_payment"]], ["cobrados", ["paid"]]] as const) {
    await act(async () => { await result.current.select(filter); });
    expect(result.current.rows.map((row) => row.status)).toEqual(statuses);
    expect(result.current.loading).toBe(false);
  }
  await act(async () => { await result.current.select(""); });
  expect(result.current.total).toBe(6);
  expect(loadContractList).not.toHaveBeenCalled();
});
it("carga solo datos faltantes y reutiliza el filtro visitado", async () => {
  vi.mocked(loadContractList).mockResolvedValue({ view: { ...initial, filter: "nuevos", rows: [rows[0]], total: 1 } });
  const { result } = renderHook(() => useContractFilter("org", partial));
  await act(async () => { await result.current.select("nuevos"); });
  expect(result.current.loading).toBe(false);
  await act(async () => { await result.current.select(""); });
  await act(async () => { await result.current.select("nuevos"); });
  expect(loadContractList).toHaveBeenCalledOnce();
});
it("muestra reintento tras error y termina carga cuando recupera datos", async () => {
  vi.mocked(loadContractList).mockResolvedValueOnce({ error: "Sin conexión" }).mockResolvedValueOnce({ view: { ...initial, filter: "nuevos" } });
  const { result } = renderHook(() => useContractFilter("org", partial));
  await act(async () => { await result.current.select("nuevos"); });
  expect(result.current.error).toBe("Sin conexión");
  expect(result.current.loading).toBe(false);
  await act(async () => { await result.current.retry(); });
  expect(result.current.error).toBe("");
});
it("una consulta bloqueada sale del skeleton en lugar de quedar permanentemente", async () => {
  vi.useFakeTimers();
  vi.mocked(loadContractList).mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useContractFilter("org", partial));
  act(() => { void result.current.select("cobrados"); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toContain("tardando demasiado");
});
it("ignora respuesta vieja cuando se cambia rápidamente de filtro", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof loadContractList>>) => void;
  vi.mocked(loadContractList).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ view: { ...initial, filter: "cobrados", rows: [rows[5]], total: 1 } });
  const { result } = renderHook(() => useContractFilter("org", partial));
  act(() => { void result.current.select("nuevos"); });
  await act(async () => { await result.current.select("cobrados"); });
  await act(async () => { resolve({ view: { ...initial, filter: "nuevos" } }); });
  expect(result.current.filter).toBe("cobrados");
  expect(result.current.rows[0].status).toBe("paid");
});
it("mantiene búsqueda, restaura Atrás e invalida caché con datos nuevos", async () => {
  const { result, rerender } = renderHook((view) => useContractFilter("org", view), { initialProps: { ...initial, q: "motor" } });
  await act(async () => { await result.current.select("nuevos"); });
  expect(window.location.search).toBe("?q=motor&estado=nuevos");
  act(() => { window.history.replaceState(null, "", "/org/contratos?q=motor"); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(result.current.filter).toBe("");
  rerender({ ...initial, rows: [], total: 0, q: "motor" });
  expect(result.current.rows).toEqual([]);
});
