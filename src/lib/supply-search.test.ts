import { beforeEach, expect, it, vi } from "vitest";
import { searchStock } from "./supply-actions";
const state = vi.hoisted(() => ({ rpc: vi.fn(), ranges: [] as number[][], eqs: [] as unknown[][], lotError: false }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/orgs", () => ({ getOrgId: async () => "org-id" }));
vi.mock("@/lib/db-error", () => ({ logDbError: vi.fn(), isSchemaError: () => false, SCHEMA_MESSAGE: "schema" }));
vi.mock("@/lib/item-search", () => ({ findItems: async () => [] }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc, from: (table: string) => {
  let offset = 0;
  const query = {
    select: () => query, in: () => query, gt: () => query, order: () => query,
    eq: (...args: unknown[]) => { state.eqs.push(args); return query; },
    range: (from: number, to: number) => { offset = from; state.ranges.push([from, to]); return query; },
    then: (resolve: (value: unknown) => void) => Promise.resolve(table === "stock_lots"
      ? { data: Array.from({ length: offset === 0 ? 500 : 1 }, (_, i) => ({ id: `${offset + i}`, item_id: "item", supplier_id: null, unit_cost_cents: 100, remaining_qty: 1 })), error: state.lotError ? { message: "failed" } : null }
      : { data: [{ id: "item", tdr_name: "TDR" }], error: null }).then(resolve),
  };
  return query;
} }) }));
beforeEach(() => { state.ranges = []; state.eqs = []; state.lotError = false; state.rpc.mockReset().mockResolvedValue({ data: [{ id: "item", sku: "SKU", name: "Motor", part_numbers: ["P-1"] }], error: null }); });
it("filtra factura y término en servidor antes del límite y suma todos los lotes", async () => {
  const result = await searchStock("org", "Motor", "invoice");
  expect(state.rpc).toHaveBeenCalledWith("search_invoice_items", { p_org: "org-id", p_invoice: "invoice", p_q: "Motor", p_limit: 16 });
  expect(state.ranges).toEqual([[0, 499], [500, 999]]);
  expect(state.eqs).toContainEqual(["purchase_lines.purchase_id", "invoice"]);
  expect(result.rows[0].onHand).toBe(501);
});
it("no presenta fallos SQL como búsquedas vacías", async () => {
  state.rpc.mockResolvedValue({ data: null, error: { message: "failed" } });
  await expect(searchStock("org", "Motor", "invoice")).rejects.toThrow();
});
