// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ItemPicker, SupplierPicker } from "./purchase-pickers";
const actions = vi.hoisted(() => ({ searchItems: vi.fn(), searchSuppliers: vi.fn() }));
vi.mock("@/lib/purchase-actions", () => actions);
beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
it("muestra error de productos y permite reintentar sin ofrecer crear por fallo de red", async () => {
  actions.searchItems.mockRejectedValueOnce(new Error("network")).mockResolvedValueOnce([]);
  render(<ItemPicker org="org" item={null} onPick={vi.fn()} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "motor" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(screen.getByRole("alert").textContent).toContain("No se pudo completar");
  expect(screen.queryByText("Crear el producto en la bodega")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "motor nuevo" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Ningún producto coincide.")).toBeTruthy();
});
it("muestra fallo de proveedores como error", async () => {
  actions.searchSuppliers.mockRejectedValue(new Error("network"));
  render(<SupplierPicker id="supplier" org="org" selected={null} onPick={vi.fn()} onClear={vi.fn()} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "proveedor" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText(/Ningún proveedor/)).toBeNull();
});
