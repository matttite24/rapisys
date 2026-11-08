// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LineQuotations } from "./line-quotations";
import { addQuotation, listQuotations } from "@/lib/quotation-actions";

vi.mock("@/lib/quotation-actions", () => ({ addQuotation: vi.fn(), listQuotations: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const props = { org: "org", contractId: "contract", lineId: "line", canAct: true, onSaved: vi.fn().mockResolvedValue(undefined) };
const entry = {
  id: "q1", supplier: "Proveedor A", contact: "0991234567", note: "Confirmará mañana", unit_cost_cents: null,
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
});
