// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { WarehouseBoard } from "./warehouse-board";
import { ListFilterLink, ListFilterNavigationProvider } from "./list-filter-navigation";
import { loadWarehouse } from "@/lib/warehouse-data";
import type { WarehouseView } from "@/lib/warehouse";
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("next/link", () => ({ default: ({ href, onNavigate, children, ...props }: { href: string; onNavigate?: (event: { preventDefault: () => void }) => void; children: React.ReactNode }) => <a {...props} href={href} onClick={(event) => { onNavigate?.({ preventDefault: () => event.preventDefault() }); if (!event.defaultPrevented) { event.preventDefault(); router.push(href); } }}>{children}</a> }));
vi.mock("@/lib/warehouse-data", () => ({ loadWarehouse: vi.fn() }));
const items: WarehouseView = { kind: "items", q: "CAT", page: 1, total: 1, rows: [{ id: "i", name: "CAT Correa", sku: "SKU-A", line: null, category: "Motor", part_numbers: ["377-9087"], margin_percent: 40, is_active: true, costCents: 100, stock: 2 }] };
const assets: WarehouseView = { kind: "activos", q: "CAT", page: 1, total: 1, rows: [{ id: "a", kind: "machinery", name: "CAT 320", brand: "CAT", model: "320", year: 2020, plate: "P", serial: "S", identifier: "I" }] };
function view(initial = items) {
  return render(<ListFilterNavigationProvider><nav><ListFilterLink href="/org/bodega">Items</ListFilterLink><ListFilterLink href="/org/bodega?vista=activos">Activos</ListFilterLink></nav><WarehouseBoard org="org" initial={initial} /></ListFilterNavigationProvider>);
}
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/org/bodega?q=CAT"); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("cambia desde menú, conserva búsqueda y vuelve sin cargar otra vez", async () => {
  vi.mocked(loadWarehouse).mockResolvedValue({ view: assets });
  view();
  fireEvent.click(screen.getByRole("link", { name: "Activos" }));
  await screen.findByRole("link", { name: "CAT 320" });
  expect((screen.getByRole("searchbox", { name: "Buscar activos" }) as HTMLInputElement).value).toBe("CAT");
  expect(window.location.search).toBe("?q=CAT&vista=activos");
  fireEvent.click(screen.getByRole("link", { name: "Items" }));
  await screen.findByRole("link", { name: "CAT Correa" });
  fireEvent.click(screen.getByRole("link", { name: "Activos" }));
  await screen.findByRole("link", { name: "CAT 320" });
  expect(loadWarehouse).toHaveBeenCalledOnce();
  expect(router.push).not.toHaveBeenCalled();
});
it("una búsqueda pendiente del catálogo anterior no vuelve a activarlo al cambiar", async () => {
  vi.useFakeTimers();
  vi.mocked(loadWarehouse).mockResolvedValue({ view: assets });
  view();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "SKU-A" } });
  await act(async () => { fireEvent.click(screen.getByRole("link", { name: "Activos" })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(400); });
  expect(screen.getByRole("searchbox", { name: "Buscar activos" })).toBeTruthy();
  expect(loadWarehouse).toHaveBeenCalledOnce();
});
it("errores de carga muestran reintento y no quedan como skeleton", async () => {
  vi.mocked(loadWarehouse).mockResolvedValueOnce({ error: "No se pudo cargar el catálogo" }).mockResolvedValueOnce({ view: assets });
  view();
  fireEvent.click(screen.getByRole("link", { name: "Activos" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("status", { name: "Cargando" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  await screen.findByRole("link", { name: "CAT 320" });
  await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
});
