// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useDebouncedSearch } from "./use-debounced-search";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("expone errores de búsqueda y permite reintentar", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new Error()).mockResolvedValueOnce(["resultado"]);
  const { result } = renderHook(() => useDebouncedSearch(fetcher));
  act(() => result.current.run("correa"));
  expect(result.current.loading).toBe(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(result.current.error).toBeTruthy();
  expect(result.current.loading).toBe(false);
  act(() => result.current.run("correa"));
  expect(result.current.error).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(result.current.results).toEqual(["resultado"]);
});

it("una respuesta atrasada no cambia resultados ni carga de la búsqueda nueva", async () => {
  let resolve!: (rows: string[]) => void;
  const old = new Promise<string[]>((done) => { resolve = done; });
  const fetcher = vi.fn().mockReturnValueOnce(old).mockResolvedValueOnce(["nuevo"]);
  const { result } = renderHook(() => useDebouncedSearch(fetcher));
  act(() => result.current.run("anterior"));
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  act(() => result.current.run("actual"));
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  await act(async () => { resolve(["viejo"]); });
  expect(result.current.results).toEqual(["nuevo"]);
  expect(result.current.loading).toBe(false);
});

it("retira resultados anteriores desde la primera tecla de otra búsqueda", async () => {
  const fetcher = vi.fn().mockResolvedValue(["producto anterior"]);
  const { result } = renderHook(() => useDebouncedSearch(fetcher));
  act(() => result.current.run("anterior"));
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(result.current.results).toEqual(["producto anterior"]);
  act(() => result.current.run("otro"));
  expect(result.current.results).toBeNull();
  expect(result.current.loading).toBe(true);
});

it("borrar descarta una petición que todavía no respondió", async () => {
  let resolve!: (rows: string[]) => void;
  const fetcher = vi.fn(() => new Promise<string[]>((done) => { resolve = done; }));
  const { result } = renderHook(() => useDebouncedSearch(fetcher));
  act(() => result.current.run("producto"));
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  act(() => result.current.clear());
  await act(async () => { resolve(["viejo"]); });
  expect(result.current.results).toBeNull();
  expect(result.current.loading).toBe(false);
});
