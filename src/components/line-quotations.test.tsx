// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LineQuotations } from "./line-quotations";
import { addQuotation, listQuotations } from "@/lib/quotation-actions";

vi.mock("@/lib/quotation-actions", () => ({
  addQuotation: vi.fn(), listQuotations: vi.fn(), searchQuoteSuppliers: vi.fn().mockResolvedValue([]),
  prepareQuotationUpload: vi.fn(), finishQuotationUpload: vi.fn(), getQuotationFileUrl: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const props = { org: "org", contractId: "contract", lineId: "line", canAct: true, onSaved: vi.fn().mockResolvedValue(undefined) };
const entry = {
  id: "q1", supplier: "Proveedor A", contact: "0991234567", note: "Confirmará mañana", unit_cost_cents: null, supplier_id: null, phone: "", email: "", files: [],
  availability: "Por confirmar", lead_time: "5 días", proforma_url: "https://ejemplo.com/proforma.pdf", created_at: "2026-11-07T15:00:00Z",
};

beforeEach(() => { vi.clearAllMocks(); vi.mocked(listQuotations).mockResolvedValue({ rows: [], more: false }); });
afterEach(cleanup);

describe("historial de cotizaciones", () => {
  it("guarda una consulta sin precio y refresca la línea", async () => {
    vi.mocked(addQuotation).mockResolvedValue({});
    render(<LineQuotations {...props} />);
    await screen.findByText("Todavía no hay gestiones registradas");
    fireEvent.click(screen.getByRole("button", { name: "Registrar gestión" }));
    fireEvent.change(screen.getByLabelText("Gestión y siguiente paso"), { target: { value: "Llamar mañana" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gestión" }));
    await waitFor(() => expect(props.onSaved).toHaveBeenCalledOnce());
    const args = vi.mocked(addQuotation).mock.calls[0];
    expect(args.slice(0, 3)).toEqual(["org", "contract", "line"]);
    expect(args[3].get("note")).toBe("Llamar mañana");
    expect(args[3].get("unitCost")).toBe("");
  });
  it("conserva los datos cuando falla el guardado", async () => {
    vi.mocked(addQuotation).mockResolvedValue({ error: "Sin permiso" });
    render(<LineQuotations {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar gestión" }));
    fireEvent.change(screen.getByLabelText("Gestión y siguiente paso"), { target: { value: "No perder esta nota" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gestión" }));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Sin permiso");
    expect((screen.getByLabelText("Gestión y siguiente paso") as HTMLTextAreaElement).value).toBe("No perder esta nota");
    expect(props.onSaved).not.toHaveBeenCalled();
  });
  it("muestra historial de solo lectura en contratos terminados", async () => {
    vi.mocked(listQuotations).mockResolvedValue({ rows: [entry], more: false });
    render(<LineQuotations {...props} canAct={false} />);
    await screen.findByText("Proveedor A");
    expect(screen.queryByRole("button", { name: "Registrar gestión" })).toBeNull();
    expect(screen.getByRole("link", { name: "Ver proforma ↗" }).getAttribute("href")).toBe(entry.proforma_url);
  });
  it("ignora respuestas tardías de otra línea", async () => {
    let resolve!: (v: { rows: typeof entry[] }) => void;
    vi.mocked(listQuotations).mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    const view = render(<LineQuotations {...props} key="line" />);
    view.rerender(<LineQuotations {...props} lineId="other" key="other" />);
    await screen.findByText("Todavía no hay gestiones registradas");
    resolve({ rows: [entry] });
    await waitFor(() => expect(screen.queryByText("Proveedor A")).toBeNull());
  });
  it("calcula el IVA debajo del precio sin IVA", async () => {
    render(<LineQuotations {...props} vatRate={15} quantity={2} />);
    await screen.findByText("Todavía no hay gestiones registradas");
    fireEvent.click(screen.getByRole("button", { name: "Registrar gestión" }));
    fireEvent.change(screen.getByLabelText(/Precio unitario sin IVA/), { target: { value: "100" } });
    const calc = screen.getByLabelText("Cálculo con IVA");
    expect(calc.textContent).toContain("$15,00");
    expect(calc.textContent).toContain("$115,00");
    expect(calc.textContent).toContain("$230,00");
  });
  it("ofrece guardar el proveedor nuevo y escribirle por WhatsApp", async () => {
    vi.mocked(addQuotation).mockResolvedValue({});
    render(<LineQuotations {...props} />);
    await screen.findByText("Todavía no hay gestiones registradas");
    fireEvent.click(screen.getByRole("button", { name: "Registrar gestión" }));
    fireEvent.change(screen.getByLabelText("Proveedor"), { target: { value: "Repuestos Sur" } });
    fireEvent.change(screen.getByLabelText("Teléfono / WhatsApp"), { target: { value: "0991234567" } });
    expect(screen.getByRole("link", { name: /WhatsApp/ }).getAttribute("href")).toContain("https://wa.me/593991234567");
    fireEvent.click(screen.getByLabelText(/Guardar «Repuestos Sur» como proveedor/));
    fireEvent.change(screen.getByLabelText("Gestión y siguiente paso"), { target: { value: "Llamar" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar gestión" }));
    await waitFor(() => expect(addQuotation).toHaveBeenCalled());
    const data = vi.mocked(addQuotation).mock.calls[0][3];
    expect(data.get("saveSupplier")).toBe("on");
    expect(data.get("phone")).toBe("0991234567");
  });
  it("muestra el precio con IVA y los adjuntos en el historial", async () => {
    vi.mocked(listQuotations).mockResolvedValue({ rows: [{ ...entry, unit_cost_cents: 10000, phone: "0991234567", files: [{ id: "f1", name: "proforma.pdf", mime_type: "application/pdf", size_bytes: 2048 }] }], more: false });
    render(<LineQuotations {...props} vatRate={15} />);
    await screen.findByText("Proveedor A");
    expect(screen.getByText(/IVA 15%/).textContent).toContain("$15,00");
    expect(screen.getByRole("button", { name: /proforma.pdf/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Escribir por WhatsApp" })).toBeTruthy();
  });
});
