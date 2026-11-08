import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveExpense, deleteExpense, loadExpenses } from "./expense-actions";
import { getContract } from "@/lib/contract-data";
import { requireUser } from "@/lib/auth";

const state = vi.hoisted(() => ({ eq: [] as unknown[][], updated: null as unknown, inserted: null as unknown, rpc: vi.fn(),
  result: { data: { id: "expense" } as { id: string } | null, error: null } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: vi.fn() }));
vi.mock("@/lib/contract-data", () => ({ getContract: vi.fn() }));
vi.mock("@/lib/orgs", () => ({ getOrgId: async () => "org-id" }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ rpc: state.rpc, from: () => {
  const query = { update: (v: unknown) => { state.updated = v; return query; }, insert: (v: unknown) => { state.inserted = v; return query; },
    delete: () => query, eq: (...args: unknown[]) => { state.eq.push(args); return query; }, select: () => query,
    maybeSingle: async () => state.result, single: async () => state.result };
  return query;
} }) }));
const form = () => { const f = new FormData(); for (const [key, value] of Object.entries({ lines: JSON.stringify([{ concept: "Taxi", category: "transport", amount: "12,50" }]), spent_on: "2026-11-08", category: "transport", payment_method: "cash" })) f.set(key, value); return f; };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireUser).mockResolvedValue(undefined); state.eq = []; state.updated = null; state.inserted = null; state.result = { data: { id: "expense" }, error: null }; state.rpc.mockImplementation(async () => state.result); });
describe("acciones de gastos", () => {
  it("inserta organización de la sesión y monto validado", async () => {
    expect(await saveExpense("org", "contract", null, form())).toEqual({ ok: true });
    expect(state.rpc).toHaveBeenCalledWith("contract_expense_save", expect.objectContaining({ p_org_id: "org-id", p_contract_id: "contract", p_id: null, p_lines: [{ concept: "Taxi", category: "transport", amount_cents: 1250 }] }));
  });
  it("acota edición y eliminación al contrato y organización", async () => {
    await saveExpense("org", "contract", "expense", form());
    expect(state.rpc).toHaveBeenCalledWith("contract_expense_save", expect.objectContaining({ p_org_id: "org-id", p_contract_id: "contract", p_id: "expense" }));
    state.eq = [];
    await deleteExpense("org", "contract", "expense");
    expect(state.eq).toEqual([["id", "expense"], ["contract_id", "contract"], ["organization_id", "org-id"]]);
  });
  it("no informa éxito cuando el gasto no pertenece al alcance o ya no existe", async () => {
    state.result.data = null;
    expect((await saveExpense("org", "contract", "missing", form())).error).toBeTruthy();
    expect((await deleteExpense("org", "contract", "missing")).error).toBeTruthy();
  });
  it("rechaza cambios sin sesión y formularios inválidos", async () => {
    expect((await saveExpense("org", "contract", null, new FormData())).fields?.lines).toBeTruthy();
    expect(state.inserted).toBeNull();
    vi.mocked(requireUser).mockRejectedValue(new Error("unauthorized"));
    await expect(saveExpense("org", "contract", null, form())).rejects.toThrow("unauthorized");
    expect(state.inserted).toBeNull();
  });
});

it("lee una categoría con totales y conserva alcance del contrato", async () => {
  vi.mocked(getContract).mockResolvedValue({ orgId: "org-id", c: {} } as Awaited<ReturnType<typeof getContract>>);
  state.rpc.mockResolvedValueOnce({ data: { version: 2, rows: [], count: 0, total_cents: 0, all_count: 4, all_total_cents: 5000 }, error: null });
  expect(await loadExpenses("org", "contract", "taxi", "transport", 2)).toMatchObject({ view: { category: "transport", page: 2, count: 0, allCount: 4, allTotalCents: 5000 } });
  expect(getContract).toHaveBeenCalledWith("org", "contract");
  expect(state.rpc).toHaveBeenCalledWith("contract_expenses_view", { p_contract_id: "contract", p_q: "taxi", p_category: "transport", p_offset: 25, p_limit: 25 });
});
it("devuelve error de contrato o esquema en lugar de dejar carga sin resolución", async () => {
  vi.mocked(getContract).mockResolvedValue(null);
  expect((await loadExpenses("org", "missing", "", "food")).error).toBeTruthy();
  vi.mocked(getContract).mockResolvedValue({ orgId: "org-id", c: {} } as Awaited<ReturnType<typeof getContract>>);
  expect((await loadExpenses("org", "contract", "", "food")).error).toBeTruthy();
});
