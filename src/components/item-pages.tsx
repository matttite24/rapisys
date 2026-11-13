import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { ItemForm, type AssetOption, type ItemData } from "@/components/item-form";
import { StockPanel, type LotView } from "@/components/stock-panel";
import type { AssetKind } from "@/lib/items";
import { centsToInput } from "@/lib/money";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";

type Params = Promise<{ org: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;
// Fecha de un lote, en la hora de Ecuador (se arma una vez, no en cada render).
const LOT_DATE = new Intl.DateTimeFormat("es-EC", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "America/Guayaquil",
});

type IdParams = Promise<{ org: string; id: string }>;


// Catálogos que necesita el formulario, siempre de la organización activa.
async function formOptions(orgId: string) {
  const supabase = await createClient();
  const [cats, sups, assets] = await Promise.all([
    supabase.from("item_categories").select("id, name").eq("organization_id", orgId).order("name"),
    supabase.from("suppliers").select("id, name").eq("organization_id", orgId).order("name"),
    supabase
      .from("assets")
      .select("id, name, kind, brand, model, year, plate")
      .eq("organization_id", orgId)
      .order("name"),
  ]);
  const assetOptions: AssetOption[] = (
    (assets.data ?? []) as {
      id: string;
      name: string;
      kind: AssetKind;
      brand: string | null;
      model: string | null;
      year: number | null;
      plate: string | null;
    }[]
  ).map((a) => ({
    id: a.id,
    name: a.name,
    kind: a.kind,
    detail: [a.brand, a.model, a.year, a.plate].filter(Boolean).join(" · "),
  }));
  return {
    categories: (cats.data ?? []) as { id: string; name: string }[],
    suppliers: (sups.data ?? []) as { id: string; name: string }[],
    assets: assetOptions,
  };
}

async function NewForm({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const [{ org }, sp] = await Promise.all([params, searchParams]);
  const orgId = await getOrgId(org);
  if (!orgId) notFound();
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v.slice(0, 200) : undefined);
  return (
    <ItemForm
      org={org}
      defaults={{ name: one(sp.nombre), part: one(sp.parte) }}
      {...(await formOptions(orgId))}
    />
  );
}

export function ItemNewPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <>
      <h1 className="sr-only">Nuevo item</h1>
      <Suspense>
        <NewForm params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function EditForm({ params }: { params: IdParams }) {
  await connection();
  const { org, id } = await params;
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  const [itemRes, pricesRes, linksRes, options, role, lotsRes, stockRes] = await Promise.all([
    supabase.from("items").select("id, name, tdr_name, sku, internal_code, barcode, unit, retail_price_cents, line, description, category_id, part_numbers, specs, margin_percent, is_active").eq("id", id).eq("organization_id", orgId).maybeSingle(),
    supabase
      .from("item_supplier_prices")
      .select("supplier_id, unit_cost_cents, vat_rate, supplier_sku")
      .eq("item_id", id)
      .order("created_at"),
    supabase.from("item_assets").select("asset_id").eq("item_id", id),
    formOptions(orgId),
    getMyRole(orgId),
    supabase
      .from("stock_lots")
      .select("id, supplier_id, unit_cost_cents, received_qty, remaining_qty, kind, note, created_at")
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("item_stock").select("on_hand").eq("item_id", id).maybeSingle(),
  ]);
  const row = itemRes.data;
  if (!row) notFound();

  const item: ItemData = {
    id: row.id,
    name: row.name,
    tdr_name: row.tdr_name,
    internal_code: row.internal_code,
    barcode: row.barcode,
    unit: row.unit,
    retail_price_cents: row.retail_price_cents === null ? null : Number(row.retail_price_cents),
    sku: row.sku,
    line: row.line,
    description: row.description,
    category_id: row.category_id,
    part_numbers: row.part_numbers ?? [],
    specs: (row.specs ?? {}) as Record<string, string>,
    margin_percent: Number(row.margin_percent),
    is_active: row.is_active,
    prices: ((pricesRes.data ?? []) as {
      supplier_id: string;
      unit_cost_cents: number;
      vat_rate: number;
      supplier_sku: string | null;
    }[]).map((p) => ({
      supplier_id: p.supplier_id,
      unit_cost: centsToInput(Number(p.unit_cost_cents)),
      vat_rate: String(Number(p.vat_rate)),
      supplier_sku: p.supplier_sku ?? "",
    })),
    asset_ids: ((linksRes.data ?? []) as { asset_id: string }[]).map((l) => l.asset_id),
  };

  const supplierName = new Map(options.suppliers.map((sp) => [sp.id, sp.name]));
  const lots: LotView[] = (
    (lotsRes.data ?? []) as {
      id: string;
      supplier_id: string | null;
      unit_cost_cents: number | null;
      received_qty: number;
      remaining_qty: number;
      kind: "compra" | "ajuste";
      note: string | null;
      created_at: string;
    }[]
  ).map((l) => ({
    id: l.id,
    date: LOT_DATE.format(new Date(l.created_at)),
    supplier: l.supplier_id ? (supplierName.get(l.supplier_id) ?? "") : "",
    costCents: l.unit_cost_cents === null ? null : Number(l.unit_cost_cents),
    received: Number(l.received_qty),
    remaining: Number(l.remaining_qty),
    kind: l.kind,
    note: l.note ?? "",
  }));

  return (
    <>
      <ItemForm org={org} item={item} canDelete={role === "admin"} onHand={Number(stockRes.data?.on_hand ?? 0)} {...options} />
      <StockPanel org={org} itemId={id} lots={lots} suppliers={options.suppliers} canEdit={role !== null} />
    </>
  );
}

export function ItemEditPage({ params }: { params: IdParams }) {
  return (
    <>
      <h1 className="sr-only">Editar item</h1>
      <Suspense>
        <EditForm params={params} />
      </Suspense>
    </>
  );
}

