// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getLineSupply, type SourceView } from "@/lib/supply-actions";
import { ReconcilePanel } from "./reconcile-panel";
import type { Reconcile } from "./use-reconcile";
import type { SupplyLine } from "./supply-board";

vi.mock("@/lib/supply-actions", () => ({ getLineSupply: vi.fn().mockResolvedValue([]), releaseSource: vi.fn() }));
vi.mock("@/components/line-quotations", () => ({ LineQuotations: () => null }));

beforeEach(() => { vi.mocked(getLineSupply).mockReset().mockResolvedValue([]); });

afterEach(() => { cleanup(); document.querySelector("[data-layout-footer]")?.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("ancla el pie del sidebar al borde real de la barra inferior y recalcula al cambiar su tamaño", async () => {
  let barTop = 836;
  const callbacks: (() => void)[] = [];
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: () => void) { callbacks.push(callback); }
    observe() {} disconnect() {}
  });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.stubGlobal("innerWidth", 1280);
  const bar = document.createElement("div");
  bar.setAttribute("data-layout-footer", "");
  document.body.append(bar);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { top: this === bar ? barTop : 0, bottom: 900, height: this === bar ? 900 - barTop : 900 } as DOMRect;
  });
  const rc = { source: "asignados", version: 0, setSource: vi.fn() } as unknown as Reconcile;
  const focus = { id: "line", n: 1, description: "BELT TENSIONER", partNumber: "377-9087", quantity: 1, reserved: 0, purchased: 0 } as SupplyLine;
  await act(async () => {
    render(<ReconcilePanel rc={rc} org="org" contractId="contract" focus={focus} canAct closing={false} onClose={vi.fn()} />);
  });
  const footer = screen.getByText("BELT TENSIONER").parentElement!;
  expect(footer.style.height).toBe("64px");
  expect(footer.className).toContain("absolute inset-x-0 bottom-0");
  // El relleno inferior suma la fila de presupuesto (2 rem) que va sobre el pie.
  expect(footer.parentElement!.style.paddingBottom).toBe("calc(64px + 2rem)");
  act(() => { barTop = 820; callbacks.forEach((callback) => callback()); });
  expect(footer.style.height).toBe("80px");
  expect(footer.parentElement!.style.paddingBottom).toBe("calc(80px + 2rem)");
});

function setupPanel() {
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  vi.stubGlobal("requestAnimationFrame", () => 0);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  const rc = { source: "asignados", version: 0, setSource: vi.fn() } as unknown as Reconcile;
  const focus = { id: "A", n: 1, description: "Línea A", partNumber: "A", quantity: 2, reserved: 0, purchased: 0 } as SupplyLine;
  return { rc, focus, org: "org", contractId: "contract", canAct: true, closing: false, onClose: vi.fn() };
}

it("oculta productos del ítem anterior durante la carga del siguiente", async () => {
  const props = setupPanel();
  let resolve!: (rows: SourceView[]) => void;
  const request = new Promise<SourceView[]>((done) => { resolve = done; });
  const row = { id: "source", itemName: "Producto A", itemSku: "A", partNumbers: [], quantity: 2, costCents: null, kind: "bodega", supplier: "Proveedor", invoice: "" } satisfies SourceView;
  vi.mocked(getLineSupply).mockResolvedValueOnce([row]).mockReturnValueOnce(request);
  const view = render(<ReconcilePanel {...props} />);
  await screen.findByText("Producto A");
  expect(screen.getByRole("complementary", { name: "Abastecimiento" })).toBeTruthy();
  view.rerender(<ReconcilePanel {...props} focus={{ ...props.focus, id: "B", description: "Línea B" }} />);
  expect(screen.queryByText("Producto A")).toBeNull();
  expect(screen.getByRole("status", { name: "Cargando productos asignados" })).toBeTruthy();
  await act(async () => { resolve([]); });
  expect(screen.getByText("Esta línea aún no tiene nada asignado")).toBeTruthy();
});

it("muestra error de carga y permite reintentar sin fingir lista vacía", async () => {
  const props = setupPanel();
  vi.mocked(getLineSupply).mockRejectedValueOnce(new Error()).mockResolvedValueOnce([]);
  render(<ReconcilePanel {...props} />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Esta línea aún no tiene nada asignado")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByText("Esta línea aún no tiene nada asignado");
});
