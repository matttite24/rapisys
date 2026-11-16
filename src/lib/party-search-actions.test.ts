import { beforeEach, expect, it, vi } from "vitest";
import { searchParties } from "./party-search-actions";
const state = vi.hoisted(() => ({ from: vi.fn(), eq: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(), result: { data: [] as unknown[], error: null as null | { code: string } } }));
vi.mock("@/lib/orgs", () => ({ getOrgId: async () => "org-id" }));
vi.mock("@/lib/db-error", () => ({ isSchemaError: () => false, logDbError: vi.fn(), SCHEMA_MESSAGE: "schema" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
  state.from(table);
  const query = { select: () => query, eq: (...args: unknown[]) => { state.eq(...args); return query; }, or: (...args: unknown[]) => { state.or(...args); return query; }, order: (...args: unknown[]) => { state.order(...args); return query; }, limit: (...args: unknown[]) => { state.limit(...args); return query; }, then: (resolve: (value: unknown) => void) => Promise.resolve(state.result).then(resolve) };
  return query;
} }) }));
beforeEach(() => { vi.clearAllMocks(); state.result = { data: [], error: null }; });
it("filtra en base de datos antes del límite y aísla organización con orden estable", async () => {
  state.result.data = [{ id: "client-10001", name: "Cliente remoto", ruc: "123" }];
  expect(await searchParties("org", "client", "123")).toHaveLength(1);
  expect(state.from).toHaveBeenCalledWith("clients");
  expect(state.eq).toHaveBeenCalledWith("organization_id", "org-id");
  expect(state.or).toHaveBeenCalledWith("name.ilike.%123%,ruc.ilike.%123%");
  expect(state.limit).toHaveBeenCalledWith(15);
  expect(state.order).toHaveBeenCalledWith("id");
});
it("distingue fallo de base de datos de ausencia de resultados", async () => {
  state.result.error = { code: "57014" };
  await expect(searchParties("org", "manager", "Ana")).rejects.toThrow("No se pudieron buscar");
  expect(state.from).toHaveBeenCalledWith("contract_managers");
});
