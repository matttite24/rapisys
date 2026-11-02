// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// Las acciones del servidor se simulan: aquí se prueba solo la interfaz.
const setContractStatus = vi.fn(async () => undefined);
vi.mock("@/lib/contract-actions", () => ({
  addLine: vi.fn(),
  removeLine: vi.fn(),
  setContractStatus: (...args: unknown[]) => setContractStatus(...(args as [])),
}));

import { StatusControl } from "./contract-lines";

afterEach(() => {
  cleanup();
  setContractStatus.mockClear();
});

describe("StatusControl: paso a En ejecución", () => {
  it("pide confirmación y no cambia el estado hasta aceptar", async () => {
    const user = userEvent.setup();
    render(<StatusControl org="acme" contractId="c1" status="new" summary={{ code: "CT-001", total: "$10,00", delivery: "05 nov 2026" }} />);

    await user.click(screen.getByRole("button", { name: /En ejecución/ }));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.textContent).toContain("¿Pasar el contrato a En ejecución?");
    expect(dialog.textContent).toContain("CT-001");
    expect(dialog.textContent).toContain("$10,00");
    expect(dialog.textContent).toContain("05 nov 2026");
    expect(setContractStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Sí, pasar a En ejecución/ }));
    await waitFor(() => expect(setContractStatus).toHaveBeenCalledWith("acme", "c1", "in_progress"));
  });

  it("Cancelar cierra el diálogo sin cambiar nada", async () => {
    const user = userEvent.setup();
    render(<StatusControl org="acme" contractId="c1" status="new" />);

    await user.click(screen.getByRole("button", { name: /En ejecución/ }));
    await screen.findByRole("alertdialog");
    await user.click(screen.getByRole("button", { name: "Cancelar" }));

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(setContractStatus).not.toHaveBeenCalled();
  });

  it("los demás pasos de estado no piden confirmación", async () => {
    const user = userEvent.setup();
    render(<StatusControl org="acme" contractId="c1" status="in_progress" />);

    await user.click(screen.getByRole("button", { name: /Finalizado/ }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(setContractStatus).toHaveBeenCalledWith("acme", "c1", "finished"));
  });
});
