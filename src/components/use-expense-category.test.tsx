// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExpenseCategory } from "./use-expense-category";
import { loadExpenses } from "@/lib/expense-actions";
import type { ExpensePage } from "@/lib/expenses";
vi.mock("@/lib/expense-actions", () => ({ loadExpenses: vi.fn() }));
const row = { id: "e", spent_on: "2026-11-08", concept: "Taxi", category: "transport" as const, amount_cents: 1250, payee: "", payment_method: "cash" as const, document_ref: "", document_url: "", notes: "", lines: [{ concept: "Taxi", category: "transport" as const, amount_cents: 1250 }] };
const initial: ExpensePage = { rows: [row], count: 1, totalCents: 1250, allCount: 1, allTotalCents: 1250, category: "", page: 1 };
const partial: ExpensePage = { ...initial, count: 50, allCount: 50 };
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/org/contratos/contract/gastos"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("filtra categorías sin skeleton ni petición cuando el listado está completo", async () => {
  const { result } = renderHook(() => useExpenseCategory("org", "contract", "", initial));
  await act(async () => { await result.current.select("food"); });
  expect(result.current.rows).toEqual([]);
  expect(result.current.loading).toBe(false);
  expect(result.current.category).toBe("food");
  await act(async () => { await result.current.select(""); });
  expect(result.current.rows).toEqual([row]);
  expect(loadExpenses).not.toHaveBeenCalled();
});
it("termina carga al recibir datos aunque el router no navegue", async () => {
  vi.mocked(loadExpenses).mockResolvedValue({ view: { ...initial, category: "transport" } });
  const { result } = renderHook(() => useExpenseCategory("org", "contract", "taxi", partial));
  await act(async () => { await result.current.select("transport"); });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe("");
  expect(result.current.rows).toEqual([row]);
  expect(window.location.search).toBe("?q=taxi&categoria=transport");
});
it("muestra error recuperable y quita skeleton cuando la consulta falla", async () => {
  vi.mocked(loadExpenses).mockResolvedValueOnce({ error: "Sin conexión" }).mockResolvedValueOnce({ view: { ...initial, category: "food" } });
  const { result } = renderHook(() => useExpenseCategory("org", "contract", "", partial));
  await act(async () => { await result.current.select("food"); });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toBe("Sin conexión");
  await act(async () => { await result.current.retry(); });
  expect(result.current.error).toBe("");
  expect(result.current.loading).toBe(false);
});
it("corta la espera si una consulta nunca responde", async () => {
  vi.useFakeTimers();
  vi.mocked(loadExpenses).mockReturnValue(new Promise(() => {}));
  const { result } = renderHook(() => useExpenseCategory("org", "contract", "", partial));
  act(() => { void result.current.select("food"); });
  expect(result.current.loading).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
  expect(result.current.loading).toBe(false);
  expect(result.current.error).toContain("tardando demasiado");
});
it("descarta respuestas de categorías anteriores y reutiliza resultados ya consultados", async () => {
  let resolve!: (value: Awaited<ReturnType<typeof loadExpenses>>) => void;
  vi.mocked(loadExpenses).mockReturnValueOnce(new Promise((done) => { resolve = done; })).mockResolvedValueOnce({ view: { ...initial, category: "transport" } });
  const { result } = renderHook(() => useExpenseCategory("org", "contract", "", partial));
  act(() => { void result.current.select("food"); });
  await act(async () => { await result.current.select("transport"); });
  await act(async () => { resolve({ view: { ...initial, category: "food" } }); });
  expect(result.current.category).toBe("transport");
  await act(async () => { await result.current.select(""); });
  await act(async () => { await result.current.select("transport"); });
  expect(loadExpenses).toHaveBeenCalledTimes(2);
});
it("restaura filtro con Atrás e invalida vistas al refrescar datos", async () => {
  const { result, rerender } = renderHook((view) => useExpenseCategory("org", "contract", "", view), { initialProps: initial });
  await act(async () => { await result.current.select("food"); });
  act(() => { window.history.replaceState(null, "", "/org/contratos/contract/gastos"); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(result.current.category).toBe("");
  expect(result.current.rows).toEqual([row]);
  rerender({ ...initial, rows: [], count: 0, allCount: 0, totalCents: 0, allTotalCents: 0 });
  expect(result.current.rows).toEqual([]);
});
