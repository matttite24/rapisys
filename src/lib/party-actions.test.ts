import { beforeEach, expect, it, vi } from "vitest";
import { createParty, saveParty, deleteParty } from "./party-actions";
const state = vi.hoisted(() => ({ table: "", payload: null as unknown, eq: [] as unknown[][], error: null as null | { code: string; message: string } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`); } }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/orgs", () => ({ getOrgId: async () => "org-id" }));
vi.mock("@/lib/db-error", () => ({ logDbError: vi.fn(), isSchemaError: () => false, SCHEMA_MESSAGE: "schema" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: (table: string) => {
  state.table = table;
  const q = { insert: (payload: unknown) => { state.payload = payload; return q; }, update: (payload: unknown) => { state.payload = payload; return q; }, delete: () => q,
    eq: (...args: unknown[]) => { state.eq.push(args); return q; }, select: () => q,
    single: async () => ({ data: state.error ? null : { id: "party", name: "Ana" }, error: state.error }),
    then: (resolve: (v: unknown) => void) => Promise.resolve({ data: state.error ? null : [{ id: "party" }], error: state.error }).then(resolve) };
  return q;
} }) }));
const form = (type?: string) => { const f = new FormData(); f.set("name", "Ana"); f.set("ruc", "1234567890"); if (type !== undefined) f.set("client_type", type); return f; };
beforeEach(() => { state.table = ""; state.payload = null; state.eq = []; state.error = null; });
it("exige uno de los tres tipos al crear o editar clientes", async () => {
  expect((await saveParty("clients", "org", null, undefined, form()))?.fields?.client_type).toBeTruthy();
  expect((await createParty("clients", "org", { name: "Ana", ruc: "", address: "", clientType: "invalid" })).fields?.client_type).toBeTruthy();
  expect(state.payload).toBeNull();
});
it("guarda tipo Persona sin cambiar ID ni vínculos del cliente", async () => {
  await expect(saveParty("clients", "org", "client-id", undefined, form("person"))).rejects.toThrow("redirect:/org/directorio?tipo=person");
  expect(state.table).toBe("clients");
  expect(state.payload).toMatchObject({ name: "Ana", client_type: "person" });
  expect(state.eq).toEqual([["id", "client-id"], ["organization_id", "org-id"]]);
});
it("alta rápida de Empresa conserva organización y devuelve ID usable en contratos", async () => {
  expect(await createParty("clients", "org", { name: "Empresa A", ruc: "", address: "", clientType: "company" })).toMatchObject({ id: "party" });
  expect(state.payload).toMatchObject({ organization_id: "org-id", client_type: "company" });
});
it("responsables y proveedores no reciben campo de tipo de cliente", async () => {
  await expect(saveParty("managers", "org", null, undefined, form())).rejects.toThrow("redirect:/org/directorio?grupo=responsables");
  expect(state.table).toBe("contract_managers");
  expect(state.payload).not.toHaveProperty("client_type");
  await expect(saveParty("suppliers", "org", null, undefined, form())).rejects.toThrow("redirect:/org/proveedores");
  expect(state.payload).not.toHaveProperty("client_type");
});
it("sigue impidiendo eliminar registros con procesos asociados", async () => {
  state.error = { code: "23503", message: "foreign key" };
  expect((await deleteParty("clients", "org", "client-id"))?.error).toContain("procesos asociados");
});
