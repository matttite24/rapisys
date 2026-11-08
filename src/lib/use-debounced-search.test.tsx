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
