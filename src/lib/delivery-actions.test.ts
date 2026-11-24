import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDeliverable } from "./delivery-actions";

vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
const state = vi.hoisted(() => ({ rows: {} as Record<string, { data: unknown; error: unknown }[]>, queries: [] as { table: string; eq: unknown[][]; in: unknown[][]; range: unknown[][] }[] }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db-error", () => ({ logDbError: vi.fn(), isSchemaError: () => false, SCHEMA_MESSAGE: "schema" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
  const result = state.rows[table]?.shift() ?? { data: [], error: null };
  const calls = { table, eq: [] as unknown[][], in: [] as unknown[][], range: [] as unknown[][] };
  state.queries.push(calls);
  const query = {
    select: () => query, order: () => query, limit: () => query,
    eq: (...args: unknown[]) => { calls.eq.push(args); return query; },
    in: (...args: unknown[]) => { calls.in.push(args); return query; },
    range: (...args: unknown[]) => { calls.range.push(args); return query; },
    then: (resolve: (value: unknown) => void) => Promise.resolve(result).then(resolve),
  };
  return query;
} }) }));
const line = { id: "line", n: "1", part_number: "REF", description: "Ítem solicitado", unit: "unit", quantity: "2", reserved: "2", delivered: "0" };
const result = (data: unknown) => ({ data, error: null });
beforeEach(() => { state.rows = {}; state.queries = []; });

describe("productos reales en generación de entrega", () => {
  it("incluye varios productos, sus cantidades y proveedor sin confundirlos con el ítem solicitado", async () => {
    state.rows = {
      contract_item_supply: [result([line, { ...line, id: "pending", reserved: 0 }, { ...line, id: "delivered", delivered: 2 }])],
      supply_sources: [result([
        { id: "s1", contract_item_id: "line", item_id: "p1", supplier_id: "supplier", quantity: "1" },
        { id: "s2", contract_item_id: "line", item_id: "p2", supplier_id: null, quantity: "1" },
      ])],
      items: [result([
        { id: "p1", name: "Producto A", sku: "SKU-A", part_numbers: ["PART-A"], description: "Original", line: "CAT" },
        { id: "p2", name: "Producto B", sku: null, part_numbers: [], description: null, line: null },
      ])], suppliers: [result([{ id: "supplier", name: "Proveedor A" }])],
    };
    const rows = await getDeliverable("contract", "list");
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Ítem solicitado");
    expect(rows[0].products).toEqual([
      { id: "s1", name: "Producto A", sku: "SKU-A", partNumbers: ["PART-A"], description: "Original", line: "CAT", supplier: "Proveedor A", quantity: 1 },
      { id: "s2", name: "Producto B", sku: null, partNumbers: [], description: null, line: null, supplier: "", quantity: 1 },
    ]);
    const sourceQuery = state.queries.find((q) => q.table === "supply_sources")!;
    expect(sourceQuery.eq).toContainEqual(["kind", "bodega"]);
    expect(sourceQuery.in).toContainEqual(["contract_item_id", ["line"]]);
  });
  it("no consulta productos cuando no hay líneas listas", async () => {
    state.rows.contract_item_supply = [result([])];
    expect(await getDeliverable("contract", "list")).toEqual([]);
    expect(state.queries).toHaveLength(1);
  });
  it("expone errores de detalle en vez de mostrar una entrega sin productos", async () => {
    state.rows = {
      contract_item_supply: [result([line])],
      supply_sources: [{ data: null, error: { code: "42501", message: "forbidden" } }],
    };
    await expect(getDeliverable("contract", "list")).rejects.toThrow("No tienes permiso");
  });
  it("recupera todos los tramos cuando superan el límite de una página", async () => {
    const source = { id: "source", contract_item_id: "line", item_id: "p", supplier_id: null, quantity: 1 };
    state.rows = {
      contract_item_supply: [result([line])],
      supply_sources: [result(Array.from({ length: 1000 }, (_, i) => ({ ...source, id: String(i) }))), result([{ ...source, id: "1000" }])],
      items: [result([{ id: "p", name: "Producto", part_numbers: [] }])],
    };
    expect((await getDeliverable("contract", "list"))[0].products).toHaveLength(1001);
    expect(state.queries.filter((q) => q.table === "supply_sources")[1].range).toContainEqual([1000, 1999]);
  });
});
