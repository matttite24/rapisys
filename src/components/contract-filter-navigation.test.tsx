// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ListFilterNavigationProvider, ListFilterLink } from "./list-filter-navigation";
import { ContractListBoard } from "./contract-list-board";
import { loadContractList } from "@/lib/contract-list-data";
import type { ContractListView } from "@/lib/contract-filters";
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/org/contratos", useSearchParams: () => new URLSearchParams(window.location.search) }));
vi.mock("next/link", () => ({ default: ({ href, onNavigate, children, ...props }: { href: string; onNavigate?: (event: { preventDefault: () => void }) => void; children: React.ReactNode }) => (
  <a {...props} href={href} onClick={(event) => { onNavigate?.({ preventDefault: () => event.preventDefault() }); if (!event.defaultPrevented) { event.preventDefault(); router.push(href); } }}>{children}</a>
) }));
vi.mock("@/lib/contract-list-data", () => ({ loadContractList: vi.fn() }));
const initial: ContractListView = { filter: "", q: "motor", page: 1, total: 2, rows: [
  { id: "a", code: "A", name: "Contrato nuevo", total_cents: 10000, term_days: 10, start_date: "2026-11-08", status: "new", clients: null, contract_managers: null },
  { id: "b", code: "B", name: "Contrato cobrado", total_cents: 20000, term_days: 10, start_date: "2026-11-08", status: "paid", clients: null, contract_managers: null },
] };
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, "", "/org/contratos?q=motor"); });
afterEach(cleanup);
it("menú cambia el filtro del listado sin navegar ni repetir consulta", async () => {
  render(<ListFilterNavigationProvider><ListFilterLink href="/org/contratos?estado=nuevos">Nuevos</ListFilterLink><ContractListBoard org="org" initial={initial} /></ListFilterNavigationProvider>);
  fireEvent.click(screen.getByRole("link", { name: "Nuevos" }));
  await waitFor(() => expect(screen.queryByRole("link", { name: "Contrato cobrado" })).toBeNull());
  expect(screen.getByRole("link", { name: "Contrato nuevo" })).toBeTruthy();
  expect(window.location.search).toBe("?q=motor&estado=nuevos");
  expect(router.push).not.toHaveBeenCalled();
  expect(loadContractList).not.toHaveBeenCalled();
});
it("sin listado activo conserva navegación normal hacia Contratos", () => {
  render(<ListFilterNavigationProvider><ListFilterLink href="/org/contratos?estado=cobrados">Cobrados</ListFilterLink></ListFilterNavigationProvider>);
  fireEvent.click(screen.getByRole("link", { name: "Cobrados" }));
  expect(router.push).toHaveBeenCalledWith("/org/contratos?estado=cobrados");
});
