import { beforeEach, expect, it, vi } from "vitest";
import { loadWarehouse } from "./warehouse-data";
import { getOrgId } from "./orgs";
const state = vi.hoisted(() => ({ results: {} as Record<string, { data: unknown; count?: number; error: unknown }>, calls: [] as { table: string; eq: unknown[][]; range: unknown[][] }[] }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/orgs", () => ({ getOrgId: vi.fn() }));
vi.mock("@/lib/db-error", () => ({ logDbError: vi.fn(), isSchemaError: () => false, SCHEMA_MESSAGE: "schema" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
  const calls = { table, eq: [] as unknown[][], range: [] as unknown[][] }; state.calls.push(calls);
  const query = { select: () => query, order: () => query, in: () => query, or: () => query,
    eq: (...args: unknown[]) => { calls.eq.push(args); return query; }, range: (...args: unknown[]) => { calls.range.push(args); return query; },
    then: (resolve: (v: unknown) => void) => Promise.resolve(state.results[table] ?? { data: [], error: null }).then(resolve),
  }; return query;
} }) }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(getOrgId).mockResolvedValue("org-id"); state.calls = []; state.results = {}; });
it("mantiene costos, existencias y categoría de los items, acotados a organización y página", async () => {
  state.results = {
    items: { data: [{ id: "i", name: "Correa", sku: "SKU", line: "CAT", category_id: "c", part_numbers: [], margin_percent: "40", is_active: true }], count: 60, error: null },
    item_categories: { data: [{ id: "c", name: "Motor" }], error: null },
    item_supplier_prices: { data: [{ item_id: "i", unit_cost_cents: 100, vat_rate: 15 }, { item_id: "i", unit_cost_cents: 50, vat_rate: 15 }], error: null },
    item_stock: { data: [{ item_id: "i", on_hand: "3" }], error: null },
  };
  const result = await loadWarehouse("org", "items", "", 2);
  expect(result.view).toMatchObject({ kind: "items", total: 60, rows: [{ category: "Motor", costCents: 58, stock: 3, margin_percent: 40 }] });
  expect(state.calls.find((c) => c.table === "items")?.eq).toContainEqual(["organization_id", "org-id"]);
  expect(state.calls.find((c) => c.table === "items")?.range).toContainEqual([50, 99]);
});
it("lee Activos como catálogo independiente y no consulta costos de productos", async () => {
  state.results.assets = { data: [{ id: "a", name: "CAT", serial: "SERIE" }], count: 1, error: null };
  expect((await loadWarehouse("org", "activos", "SERIE")).view?.kind).toBe("activos");
  expect(state.calls.map((c) => c.table)).toEqual(["assets"]);
  expect(state.calls[0].eq).toContainEqual(["organization_id", "org-id"]);
});
it("distingue errores de listado vacío y rechaza organizaciones no disponibles", async () => {
  state.results.items = { data: null, count: 0, error: { code: "500", message: "failure" } };
  expect((await loadWarehouse("org", "items", "")).error).toBeTruthy();
  vi.mocked(getOrgId).mockResolvedValue(null);
  expect((await loadWarehouse("other", "items", "")).error).toBeTruthy();
});
it("lee Proveedores como catálogo propio, acotado a la organización y a la página", async () => {
  state.results.suppliers = { data: [{ id: "s", name: "Repuestos SA", ruc: "1790000000001", address: null }], count: 60, error: null };
  const result = await loadWarehouse("org", "proveedores", "Repuestos", 2);
  expect(result.view).toMatchObject({ kind: "proveedores", total: 60, page: 2, rows: [{ id: "s", name: "Repuestos SA" }] });
  expect(state.calls.map((c) => c.table)).toEqual(["suppliers"]);
  expect(state.calls[0].eq).toContainEqual(["organization_id", "org-id"]);
  expect(state.calls[0].range).toContainEqual([50, 99]);
});
