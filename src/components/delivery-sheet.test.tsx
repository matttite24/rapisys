// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeliveryActions } from "./delivery-sheet";
import { HeaderSlotContext } from "./header-action";
import { createDelivery, getDeliverable, type Deliverable } from "@/lib/delivery-actions";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/delivery-actions", () => ({ createDelivery: vi.fn(), getDeliverable: vi.fn() }));
vi.mock("@/components/date-picker", () => ({
  toIsoDate: () => "2026-11-08",
  DatePicker: ({ value, onChange, ...props }: { value: string; onChange: (v: string) => void }) => <input {...props} value={value} onChange={(event) => onChange(event.target.value)} />,
}));
const rows: Deliverable[] = [{
  id: "line", n: 1, partNumber: "REQUEST-1", description: "Ítem solicitado", unit: "unit", quantity: 2,
  products: [
    { id: "source-a", name: "Producto real A", sku: "SKU-A", partNumbers: ["PART-A"], description: "Original de fábrica", line: "CAT", supplier: "Proveedor A", quantity: 1 },
    { id: "source-b", name: "Producto real B", sku: "SKU-B", partNumbers: ["PART-B"], description: null, line: null, supplier: "Proveedor B", quantity: 1 },
  ],
}];
let slot: HTMLDivElement;
beforeEach(() => { vi.clearAllMocks(); slot = document.createElement("div"); document.body.append(slot); });
afterEach(() => { cleanup(); slot.remove(); });
function openDelivery() {
  render(<HeaderSlotContext.Provider value={slot}><DeliveryActions org="org" contractId="contract" listId="list" listName="Excavadora" canAct ready={1} /></HeaderSlotContext.Provider>);
  fireEvent.click(screen.getByRole("button", { name: /Generar entrega/ }));
}

describe("revisión de productos antes de generar entrega", () => {
  it("muestra productos reales y envía la línea completa al confirmar", async () => {
    vi.mocked(getDeliverable).mockResolvedValue(rows);
    vi.mocked(createDelivery).mockResolvedValue({ id: "delivery" });
    openDelivery();
    await screen.findByText("Producto real A");
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Ítem solicitado")).toBeTruthy();
    expect(within(dialog).getByText("SKU-A")).toBeTruthy();
    expect(within(dialog).getByText("PART-A")).toBeTruthy();
    expect(within(dialog).getByText("Original de fábrica")).toBeTruthy();
    expect(within(dialog).getByText("Proveedor: Proveedor B")).toBeTruthy();
    expect(within(dialog).getByLabelText("Cantidad de Producto real A: 1")).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Entregar la línea 1" }));
    expect((within(dialog).getByRole("button", { name: "Generar entrega y reporte" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Entregar la línea 1" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Generar entrega y reporte" }));
    await waitFor(() => expect(createDelivery).toHaveBeenCalledWith("org", "contract", "list", { date: "2026-11-08", receivedBy: "", notes: "", lineIds: ["line"] }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/org/contratos/contract/entregas/delivery"));
  });
  it("permite recuperar una carga fallida", async () => {
    vi.mocked(getDeliverable).mockRejectedValueOnce(new Error()).mockResolvedValueOnce(rows);
    openDelivery();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    await screen.findByText("Producto real B");
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("impide confirmar si faltan productos para revisar", async () => {
    vi.mocked(getDeliverable).mockResolvedValue([{ ...rows[0], products: [] }]);
    openDelivery();
    await screen.findByText("No se encontraron productos asignados. Actualiza antes de entregar.");
    expect((screen.getByRole("button", { name: "Generar entrega y reporte" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
