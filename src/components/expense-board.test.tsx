// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseBoard } from "./expense-board";
import { saveExpense, deleteExpense, loadExpenses } from "@/lib/expense-actions";
import type { Expense } from "@/lib/expenses";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/org/contratos/contract/gastos", useSearchParams: () => new URLSearchParams() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/expense-actions", () => ({ saveExpense: vi.fn(), deleteExpense: vi.fn(), loadExpenses: vi.fn() }));
vi.mock("@/components/date-picker", () => ({
  toIsoDate: () => "2026-11-08",
  DatePicker: ({ value, onChange, ...props }: { value: string; onChange: (v: string) => void }) => <input {...props} value={value} onChange={(event) => onChange(event.target.value)} />,
}));
const row: Expense = { id: "expense", spent_on: "2026-11-08", concept: "Taxi a bodega", category: "transport", amount_cents: 1250, lines: [{ id: "line", concept: "Taxi a bodega", category: "transport", amount_cents: 1250 }],
  payment_method: "transfer", payee: "José", document_ref: "REC-1", document_url: "https://example.com/recibo", notes: "Retiro de repuestos" };
const props = { org: "org", contractId: "contract", rows: [row], count: 1, totalCents: 1250, allCount: 1, allTotalCents: 1250, q: "", category: "", page: 1 };
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/org/contratos/contract/gastos"); vi.mocked(loadExpenses).mockResolvedValue({ view: { rows: [row], count: 1, totalCents: 1250, allCount: 1, allTotalCents: 1250, category: "transport", page: 1 } }); vi.stubGlobal("requestAnimationFrame", (cb: () => void) => { cb(); return 0; }); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Gastos del contrato", () => {
  it("registra desde el estado vacío y refresca el total tras guardar", async () => {
    vi.mocked(saveExpense).mockResolvedValue({ ok: true });
    render(<ExpenseBoard {...props} rows={[]} count={0} allCount={0} totalCents={0} allTotalCents={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar primer gasto" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Concepto línea 1"), { target: { value: "Almuerzo del equipo" } });
    fireEvent.change(within(dialog).getByLabelText("Monto línea 1"), { target: { value: "25,50" } });
    fireEvent.change(within(dialog).getByLabelText("Método de pago"), { target: { value: "cash" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar documento" }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
    const [org, contract, id, form] = vi.mocked(saveExpense).mock.calls[0];
    expect([org, contract, id]).toEqual(["org", "contract", null]);
    expect(JSON.parse(String(form.get("lines")))).toEqual([{ concept: "Almuerzo del equipo", category: "other", amount: "25,50" }]);
  });
  it("abre edición con datos y conserva formulario si guardar falla", async () => {
    vi.mocked(saveExpense).mockResolvedValue({ fields: { "lines.0.concept": "Revisa el concepto." } });
    render(<ExpenseBoard {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar gasto: Taxi a bodega" }));
    const dialog = await screen.findByRole("dialog");
    expect((within(dialog).getByLabelText("Monto línea 1") as HTMLInputElement).value).toBe("12.50");
    expect((within(dialog).getByLabelText("Método de pago") as HTMLSelectElement).value).toBe("transfer");
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar documento" }));
    await screen.findByText("Revisa el concepto.");
    expect((within(dialog).getByLabelText("Concepto línea 1") as HTMLInputElement).value).toBe(row.concept);
    expect(vi.mocked(saveExpense).mock.calls[0][2]).toBe("expense");
    expect(router.refresh).not.toHaveBeenCalled();
  });
  it("elimina únicamente tras segundo clic de confirmación", async () => {
    vi.mocked(deleteExpense).mockResolvedValue({ ok: true });
    render(<ExpenseBoard {...props} />);
    const button = screen.getByRole("button", { name: "Eliminar gasto: Taxi a bodega" });
    fireEvent.click(button);
    expect(deleteExpense).not.toHaveBeenCalled();
    fireEvent.click(button);
    await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith("org", "contract", "expense"));
    await waitFor(() => expect(router.refresh).toHaveBeenCalledOnce());
  });
  it("conserva búsqueda al cambiar categoría y reinicia paginación", async () => {
    render(<ExpenseBoard {...props} q="taxi" page={2} />);
    fireEvent.click(screen.getByRole("button", { name: "Transporte" }));
    await waitFor(() => expect(loadExpenses).toHaveBeenCalledWith("org", "contract", "taxi", "transport", 1));
    expect(window.location.search).toBe("?q=taxi&categoria=transport");
    expect(router.push).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("status", { name: "Cargando" })).toBeNull());
  });
});

it("añade y quita líneas sin perder datos y recalcula total del documento", async () => {
  vi.mocked(saveExpense).mockResolvedValue({ ok: true });
  render(<ExpenseBoard {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar gasto: Taxi a bodega" }));
  const dialog = await screen.findByRole("dialog");
  fireEvent.click(within(dialog).getByRole("button", { name: "Añadir línea" }));
  fireEvent.change(within(dialog).getByLabelText("Concepto línea 2"), { target: { value: "Almuerzo" } });
  fireEvent.change(within(dialog).getByLabelText("Categoría línea 2"), { target: { value: "food" } });
  fireEvent.change(within(dialog).getByLabelText("Monto línea 2"), { target: { value: "7,50" } });
  expect(within(dialog).getByLabelText("Total del documento").textContent?.replace(/[^0-9]/g, "")).toBe("2000");
  fireEvent.click(within(dialog).getByRole("button", { name: "Quitar línea 1" }));
  expect((within(dialog).getByLabelText("Concepto línea 1") as HTMLInputElement).value).toBe("Almuerzo");
  expect(within(dialog).getByLabelText("Total del documento").textContent?.replace(/[^0-9]/g, "")).toBe("750");
  fireEvent.click(within(dialog).getByRole("button", { name: "Guardar documento" }));
  await waitFor(() => expect(saveExpense).toHaveBeenCalled());
  expect(JSON.parse(String(vi.mocked(saveExpense).mock.calls[0][3].get("lines")))).toEqual([{ concept: "Almuerzo", category: "food", amount: "7,50" }]);
});
