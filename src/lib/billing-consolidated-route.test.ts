import ExcelJS from "exceljs";
import { expect, it, vi } from "vitest";

const rows = [{ id: "l1", description: "Filtro", part_number: "F-1", quantity: 2, unit: "unit", reference_cents: 20000, cost_cents: 11500, sources: 1, unknown: 0, margin_override: null, excluded: false }];
vi.mock("@/lib/contract-data", () => ({ getContract: async () => ({ orgId: "o", c: { code: "C-1", name: "Contrato", client_id: "c" } }) }));
vi.mock("@/lib/line-assets", () => ({ assetsForLines: async () => new Map([["l1", ["Excavadora"]]]) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => {
    const q = (data: unknown) => {
      const o: Record<string, unknown> = {};
      for (const m of ["select", "eq", "is", "order", "limit"]) o[m] = () => o;
      o.maybeSingle = async () => ({ data });
      o.then = (res: (v: unknown) => void) => Promise.resolve({ data, error: null }).then(res);
      return o;
    };
    return {
      auth: { getClaims: async () => ({ data: { claims: {} } }) },
      from: (t: string) => q(t === "deliveries" ? [{ id: "d1", number: 3, delivered_on: "2026-11-09", received_by: null, list_id: "li" }] : t === "contract_lists" ? [{ id: "li", name: "Factura 001 · PROV" }] : { name: "Cliente" }),
      rpc: async () => ({ data: { lines: rows }, error: null }),
    };
  },
}));

it("la ruta del consolidado devuelve un Excel válido", async () => {
  const { GET } = await import("../app/[org]/contratos/[id]/revision/consolidado/excel/route");
  const res = await GET({ nextUrl: new URL("http://x/y?cols=delivery,date,desc,asset,cost,final,profit") } as never, { params: Promise.resolve({ org: "o", id: "i" }) } as never);
  expect(res.status).toBe(200);
  expect(res.headers.get("content-disposition")).toContain("consolidado");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as unknown as ArrayBuffer);
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Resumen", "Detalle"]);
  expect(wb.getWorksheet("Detalle")!.getCell("A7").value).toBe("ENT-003");
});
