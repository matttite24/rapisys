import type { SupabaseClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";
import { findItems } from "./item-search";

vi.mock("@/lib/db-error", () => ({
  isSchemaError: (error: { code: string }) => error.code === "PGRST202",
  logDbError: vi.fn(),
  SCHEMA_MESSAGE: "Falta migración",
}));

it("busca números de parte parciales en la función indexada y limita resultados", async () => {
  const rows = [{ id: "item-15001", name: "Filtro", sku: null, part_numbers: ["1R-0750"] }];
  const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
  const db = { rpc } as unknown as SupabaseClient;
  expect(await findItems(db, "org", " 1R-07 ", 1000)).toEqual(rows);
  expect(rpc).toHaveBeenCalledWith("search_items", { p_org: "org", p_q: "1R-07", p_limit: 50 });
});

it("reporta errores y migraciones faltantes sin degradar a una búsqueda de partes exactas", async () => {
  const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: "PGRST202" } });
  const from = vi.fn();
  const db = { rpc, from } as unknown as SupabaseClient;
  await expect(findItems(db, "org", "1R-07")).rejects.toThrow("Falta migración");
  expect(from).not.toHaveBeenCalled();
  rpc.mockResolvedValue({ data: null, error: { code: "57014" } });
  await expect(findItems(db, "org", "Filtro")).rejects.toThrow("No se pudieron buscar los productos");
});
