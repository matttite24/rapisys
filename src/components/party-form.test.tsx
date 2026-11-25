// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { PartyForm } from "./party-form";
import { HeaderSlotContext } from "@/components/header-action";
import { saveParty } from "@/lib/party-actions";
vi.mock("@/lib/party-actions", () => ({ saveParty: vi.fn(), deleteParty: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(saveParty).mockResolvedValue({ fields: { name: "Revisa nombre" } }); });
afterEach(cleanup);
// En la página, Cancelar y Guardar viven en el encabezado: se les da un hueco como el que pone el shell.
function renderInPage(ui: React.ReactElement) {
  const slot = document.createElement("div");
  document.body.appendChild(slot);
  return render(<HeaderSlotContext.Provider value={slot}>{ui}</HeaderSlotContext.Provider>);
}
it("preselecciona tipo de la lista y envía el tipo al guardar cliente", async () => {
  renderInPage(<PartyForm org="org" kind="clients" defaultClientType="company" />);
  expect((screen.getByLabelText("Tipo de cliente") as HTMLSelectElement).value).toBe("company");
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Empresa A" } });
  fireEvent.change(screen.getByLabelText("Tipo de cliente"), { target: { value: "person" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
  await waitFor(() => expect(saveParty).toHaveBeenCalled());
  expect(vi.mocked(saveParty).mock.calls[0][4].get("client_type")).toBe("person");
});
it("responsables conservan formulario propio sin tipo de cliente", () => {
  renderInPage(<PartyForm org="org" kind="managers" />);
  expect(screen.queryByLabelText("Tipo de cliente")).toBeNull();
  expect(screen.getByRole("link", { name: "Cancelar" }).getAttribute("href")).toBe("/org/directorio?grupo=responsables");
});
