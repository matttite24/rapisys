// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useReconcile } from "./use-reconcile";
import { listContractInvoices } from "@/lib/purchase-actions";
import { getInvoiceLines, proposeMatches, type InvoiceLine } from "@/lib/reconcile-actions";
import { getStockSummary, searchStock, type StockResult } from "@/lib/supply-actions";

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() } }));
vi.mock("@/lib/purchase-actions", () => ({ listContractInvoices: vi.fn(), assignPurchase: vi.fn() }));
vi.mock("@/lib/reconcile-actions", () => ({ getInvoiceLines: vi.fn(), proposeMatches: vi.fn(), applyMatches: vi.fn(), undoMatches: vi.fn() }));
vi.mock("@/lib/supply-actions", () => ({ getStockSummary: vi.fn(), reserveStock: vi.fn(), searchStock: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getStockSummary).mockResolvedValue({ products: 0, units: 0 }); });
afterEach(cleanup);

describe("carga de Abastecimiento", () => {
  it("carga facturas solo al abrir su pestaña y evita consultas duplicadas", async () => {
    const request = deferred<[]>();
    vi.mocked(listContractInvoices).mockReturnValue(request.promise);
    const { result } = renderHook(() => useReconcile("org", "contract"));
    act(() => result.current.show());
    expect(listContractInvoices).not.toHaveBeenCalled();
    act(() => { result.current.setSource("facturas"); result.current.setSource("facturas"); });
    expect(listContractInvoices).toHaveBeenCalledOnce();
    await act(async () => { request.resolve([]); });
    act(() => result.current.setSource("facturas"));
    expect(result.current.invoices).toEqual([]);
    expect(listContractInvoices).toHaveBeenCalledOnce();
  });
  it("descarta productos de una factura anterior que responde tarde", async () => {
    const first = deferred<InvoiceLine[]>();
    const second = deferred<InvoiceLine[]>();
    vi.mocked(getInvoiceLines).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useReconcile("org", "contract"));
    act(() => { void result.current.chooseInvoice("A"); });
    act(() => { void result.current.chooseInvoice("B"); });
    const rows = [{ id: "B-line" }] as InvoiceLine[];
    await act(async () => { second.resolve(rows); });
    await act(async () => { first.resolve([{ id: "A-line" }] as InvoiceLine[]); });
    expect(result.current.invoiceId).toBe("B");
    expect(result.current.lines).toEqual(rows);
  });
  it("no repone productos después de salir de una factura", async () => {
    const request = deferred<InvoiceLine[]>();
    vi.mocked(getInvoiceLines).mockReturnValue(request.promise);
    const { result } = renderHook(() => useReconcile("org", "contract"));
    act(() => { void result.current.chooseInvoice("A"); });
    await act(async () => { await result.current.chooseInvoice(""); });
    await act(async () => { request.resolve([{ id: "old" }] as InvoiceLine[]); });
    expect(result.current.invoiceId).toBe("");
    expect(result.current.lines).toBeNull();
  });
  it("permite reintentar errores de facturas y productos", async () => {
    vi.mocked(listContractInvoices).mockRejectedValueOnce(new Error()).mockResolvedValueOnce([]);
    vi.mocked(getInvoiceLines).mockRejectedValueOnce(new Error()).mockResolvedValueOnce([]);
    const { result } = renderHook(() => useReconcile("org", "contract"));
    await act(async () => { await result.current.loadInvoices(); });
    expect(result.current.invoiceError).toBeTruthy();
    await act(async () => { await result.current.loadInvoices(true); });
    expect(result.current.invoiceError).toBe("");
    expect(result.current.invoices).toEqual([]);
    await act(async () => { await result.current.chooseInvoice("A"); });
    expect(result.current.invoiceLinesError).toBeTruthy();
    await act(async () => { await result.current.chooseInvoice("A"); });
    expect(result.current.invoiceLinesError).toBe("");
    expect(result.current.lines).toEqual([]);
  });
  it("reintenta resumen de bodega y reutiliza el resultado al volver a la pestaña", async () => {
    vi.mocked(getStockSummary).mockRejectedValueOnce(new Error()).mockResolvedValueOnce({ products: 3, units: 8 });
    const { result } = renderHook(() => useReconcile("org", "contract"));
    await act(async () => { await result.current.loadStockSummary(); });
    expect(result.current.stockSummaryError).toBeTruthy();
    await act(async () => { await result.current.loadStockSummary(true); });
    expect(result.current.stockSummary).toEqual({ products: 3, units: 8 });
    act(() => result.current.setSource("bodega"));
    expect(getStockSummary).toHaveBeenCalledTimes(2);
  });
  it("descarta propuestas de una factura que ya fue cambiada", async () => {
    vi.mocked(getInvoiceLines).mockResolvedValue([]);
    const request = deferred<Awaited<ReturnType<typeof proposeMatches>>>();
    vi.mocked(proposeMatches).mockReturnValue(request.promise);
    const { result } = renderHook(() => useReconcile("org", "contract"));
    await act(async () => { await result.current.chooseInvoice("A"); });
    act(() => { void result.current.propose(); });
    await act(async () => { await result.current.chooseInvoice("B"); });
    await act(async () => { request.resolve({ proposals: [{ key: "stale" }] as never[], unmatched: 0 }); });
    expect(result.current.review).toBeNull();
    expect(result.current.proposing).toBe(false);
  });
});

it("oculta existencias anteriores y evita asignarlas mientras busca otro producto", async () => {
  vi.useFakeTimers();
  try {
    const row = { id: "stock", name: "Correa", sku: "C", partNumbers: [], onHand: 2, lots: [{ id: "lot", remaining: 2, costCents: 100, supplier: "Proveedor" }] } satisfies StockResult;
    vi.mocked(searchStock).mockResolvedValue({ rows: [row], more: false });
    const { result } = renderHook(() => useReconcile("org", "contract"));
    await act(async () => { result.current.setSource("bodega"); });
    act(() => result.current.searchStockText("correa"));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    act(() => result.current.pickStock(row));
    expect(result.current.current?.label).toBe("C");
    act(() => result.current.searchStockText("filtro"));
    expect(result.current.stockRows).toBeNull();
    expect(result.current.current).toBeNull();
    expect(result.current.stockLoading).toBe(true);
  } finally { vi.useRealTimers(); }
});
