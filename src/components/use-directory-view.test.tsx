// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDirectoryView } from "./use-directory-view";
import { loadDirectory } from "@/lib/directory-data";
import type { DirectoryView } from "@/lib/directory";
vi.mock("@/lib/directory-data", () => ({ loadDirectory: vi.fn() }));
const initial: DirectoryView = { scope: "", q: "", page: 1, total: 3, rows: [
  { id: "c", name: "Empresa A", ruc: "1", address: "Quito", client_type: "company" },
  { id: "i", name: "Institución B", ruc: "2", address: "Puyo", client_type: "institution" },
  { id: "p", name: "Ana", ruc: "3", address: "Puyo", client_type: "person" },
] };
const managers: DirectoryView = { scope: "managers", q: "", page: 1, total: 1, rows: [{ id: "m", name: "Responsable", ruc: null, address: null }] };
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/org/directorio"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("filtra Empresas, Instituciones y Personas con clientes completos sin consultar", async () => {
  const { result } = renderHook(() => useDirectoryView("org", initial));
  for (const [scope, id] of [["company", "c"], ["institution", "i"], ["person", "p"]] as const) {
    await act(async () => { await result.current.select(scope); });
    expect(result.current.view.rows.map((row) => row.id)).toEqual([id]);
  }
  expect(loadDirectory).not.toHaveBeenCalled();
});
it("carga responsables por separado y reutiliza datos al volver", async () => {
  vi.mocked(loadDirectory).mockResolvedValue({ view: managers });
  const { result } = renderHook(() => useDirectoryView("org", initial));
  await act(async () => { await result.current.select("managers"); });
  expect(result.current.view.rows[0].id).toBe("m");
  await act(async () => { await result.current.select("person"); });
  expect(result.current.view.rows[0].id).toBe("p");
  await act(async () => { await result.current.select("managers"); });
  expect(loadDirectory).toHaveBeenCalledOnce();
  expect(window.location.search).toBe("?grupo=responsables");
});
it("busca localmente, conserva historial y actualiza caché con respuestas nuevas", async () => {
  const { result, rerender } = renderHook((view) => useDirectoryView("org", view), { initialProps: initial });
  await act(async () => { await result.current.select("person", 1, "Ana"); });
  expect(result.current.view.rows.map((row) => row.id)).toEqual(["p"]);
  expect(window.location.search).toBe("?q=Ana&tipo=person");
  act(() => { window.history.replaceState(null, "", "/org/directorio"); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(result.current.view.total).toBe(3);
  rerender({ ...initial, total: 0, rows: [] });
  expect(result.current.view.total).toBe(0);
});
it("consulta bloqueada sale de skeleton y permite reintentar", async () => {
  vi.useFakeTimers();
  vi.mocked(loadDirectory).mockReturnValueOnce(new Promise(() => {})).mockResolvedValueOnce({ view: managers });
  const { result } = renderHook(() => useDirectoryView("org", initial));
  act(() => { void result.current.select("managers"); });
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBeTruthy();
  await act(async () => { await result.current.retry(); });
  expect(result.current.error).toBe("");
});
