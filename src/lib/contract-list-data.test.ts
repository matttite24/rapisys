import { beforeEach, expect, it, vi } from "vitest";
import { loadContractList } from "./contract-list-data";
const state = vi.hoisted(() => ({ eq: vi.fn(), in: vi.fn(), or: vi.fn(), range: vi.fn(), result: { data: [] as unknown[], count: 0, error: null as null | { code: string; message: string } } }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/db-error", () => ({ logDbError: vi.fn(), isSchemaError: () => false, SCHEMA_MESSAGE: "schema" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: () => {
  const query = { select: () => query, order: () => query, eq: (...args: unknown[]) => { state.eq(...args); return query; }, in: (...args: unknown[]) => { state.in(...args); return query; }, or: (...args: unknown[]) => { state.or(...args); return query; }, range: (...args: unknown[]) => { state.range(...args); return query; }, then: (resolve: (value: unknown) => void) => Promise.resolve(state.result).then(resolve) };
  return query;
} }) }));
beforeEach(() => { vi.clearAllMocks(); state.result = { data: [], count: 0, error: null }; });
it("acota organización, pagina y filtra todos los estados de Por cobrar", async () => {
  expect(await loadContractList("org", "motor", "cierre", 2)).toMatchObject({ view: { filter: "cierre", page: 2, q: "motor" } });
  expect(state.eq).toHaveBeenCalledWith("organizations.slug", "org");
  expect(state.in).toHaveBeenCalledWith("status", ["finished", "invoiced", "pending_payment"]);
  expect(state.range).toHaveBeenCalledWith(50, 99);
  expect(state.or).toHaveBeenCalledWith("code.ilike.%motor%,name.ilike.%motor%");
});
it("distingue errores de listas vacías y normaliza filtros inválidos", async () => {
  state.result.error = { code: "500", message: "failure" };
  expect((await loadContractList("org", "", "nuevos")).error).toBeTruthy();
  state.result.error = null;
  expect((await loadContractList("org", "", "invalid")).view?.filter).toBe("");
});
