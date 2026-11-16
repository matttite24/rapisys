import { expect, it, vi } from "vitest";
import { getInvoiceLines } from "./reconcile-actions";
const state = vi.hoisted(() => ({ ranges: [] as number[][] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/orgs", () => ({ getOrgId: async () => "org-id" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
  let offset = 0;
  const query = {
    select: () => query, eq: () => query, in: () => query, gt: () => query, order: () => query,
    range: (from: number, to: number) => { offset = from; if (table === "purchase_lines") state.ranges.push([from, to]); return query; },
    then: (resolve: (value: unknown) => void) => Promise.resolve({ data: table === "purchase_lines"
      ? Array.from({ length: Math.min(500, 1001 - offset) }, (_, i) => ({ id: `line-${offset + i}`, item_id: "item", quantity: 1, unit_cost_cents: 100, received_qty: 0, xml_code: `PART-${offset + i}`, new_part_number: null }))
      : table === "items" ? [{ id: "item", name: "Motor", tdr_name: null, sku: null, part_numbers: [] }] : [], error: null }).then(resolve),
  };
  return query;
} }) }));
it("incluye productos posteriores a las primeras mil líneas para buscar en factura completa", async () => {
  const rows = await getInvoiceLines("org", "contract", "invoice");
  expect(state.ranges).toEqual([[0, 499], [500, 999], [1000, 1499]]);
  expect(rows).toHaveLength(1001);
  expect(rows[1000]).toMatchObject({ id: "line-1000", code: "PART-1000", name: "Motor", free: 1 });
});
