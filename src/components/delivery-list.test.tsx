// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DeliveryList, type DeliveryListRow } from "./delivery-list";

const rows: DeliveryListRow[] = [
  { id: "a", number: 1, delivered_on: "2026-11-08", received_by: "José Pérez", listName: "Excavadora", lines: 2, units: 4 },
  { id: "b", number: 2, delivered_on: "2026-10-01", received_by: "Ana", listName: "Camión", lines: 1, units: 2 },
];
afterEach(cleanup);
it("filtra al escribir por código, fecha, lista y persona, sin distinguir acentos", () => {
  render(<DeliveryList org="org" contractId="contract" rows={rows} />);
  const search = screen.getByRole("searchbox", { name: "Buscar entregas" });
  for (const text of ["ENT-001", "2026-11-08", "excavadora", "jose perez", "jose excavadora"]) {
    fireEvent.change(search, { target: { value: text } });
    expect(screen.getByRole("link", { name: "ENT-001" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "ENT-002" })).toBeNull();
    expect(screen.getByText("1 de 2")).toBeTruthy();
  }
  fireEvent.change(search, { target: { value: "camion" } });
  expect(screen.getByRole("link", { name: "ENT-002" })).toBeTruthy();
  fireEvent.change(search, { target: { value: "" } });
  expect(screen.getByRole("link", { name: "ENT-001" })).toBeTruthy();
  expect(screen.getByRole("link", { name: "ENT-002" })).toBeTruthy();
});
it("distingue búsqueda sin resultados de lista sin entregas", () => {
  render(<DeliveryList org="org" contractId="contract" rows={rows} />);
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "inexistente" } });
  expect(screen.getByRole("status").textContent).toBe("Ninguna entrega coincide con la búsqueda.");
  expect(screen.queryByRole("link", { name: "Ir a Abastecimiento" })).toBeNull();
});
