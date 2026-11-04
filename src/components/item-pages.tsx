import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { ItemForm, type AssetOption, type ItemData } from "@/components/item-form";
import { StockPanel, type LotView } from "@/components/stock-panel";
import { PageSection, TABLE_TH as TH, TABLE_TD as TD } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AssetKind } from "@/lib/items";
import { centsToInput, formatCents, salePriceCents } from "@/lib/money";
import { pageRange, readPage } from "@/lib/pagination";
import { cleanSearch } from "@/lib/search";
import { getMyRole, getOrgId } from "@/lib/orgs";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

type Params = Promise<{ org: string }>;
type IdParams = Promise<{ org: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;


type ItemRow = {
  id: string;
  sku: string | null;
  name: string;
  line: string | null;
  category_id: string | null;
  part_numbers: string[];
  margin_percent: number;
  is_active: boolean;
};

async function List({ params, searchParams }: { params: Params; searchParams: Search }) {
  await connection();
  const { org } = await params;
  const search = await searchParams;
  const raw = search.q;
  const q = cleanSearch(typeof raw === "string" ? raw : "");
  const page = readPage(search);
  const orgId = await getOrgId(org);
  if (!orgId) notFound();

  const supabase = await createClient();
  let query = supabase
    .from("items")
    .select("id, sku, name, line, category_id, part_numbers, margin_percent, is_active", {
      count: "exact",
    })
    .eq("organization_id", orgId)
    .order("name")
    .range(...pageRange(page));
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,part_numbers.cs.{${q}}`);

  const [itemsRes, catsRes] = await Promise.all([
    query,
    supabase.from("item_categories").select("id, name").eq("organization_id", orgId),
  ]);

  const rows = (itemsRes.data ?? []) as ItemRow[];
  const total = itemsRes.count ?? 0;
  const cats = new Map((catsRes.data ?? []).map((c) => [c.id as string, c.name as string]));

  // Costo más bajo (sin IVA) solo de los items de esta página.
  const best = new Map<string, number>();
  if (rows.length) {
    const { data: prices } = await supabase
      .from("item_supplier_prices")
      .select("item_id, unit_cost_cents")
      .in("item_id", rows.map((r) => r.id));
    for (const p of (prices ?? []) as { item_id: string; unit_cost_cents: number }[]) {
      const cost = Number(p.unit_cost_cents);
      if (!best.has(p.item_id) || cost < best.get(p.item_id)!) best.set(p.item_id, cost);
    }
  }
  // Existencias de los items de esta página.
  const stock = new Map<string, number>();
  if (rows.length) {
    const { data: onHand } = await supabase
      .from("item_stock")
      .select("item_id, on_hand")
      .in("item_id", rows.map((r) => r.id));
    for (const s of (onHand ?? []) as { item_id: string; on_hand: number }[]) {
      stock.set(s.item_id, Number(s.on_hand));
    }
  }
  const newHref = `/${org}/bodega/nuevo`;

  return (
    <>
      <HeaderAction icon={Add01Icon} label="Nuevo item" href={newHref} />
      <PageSection className="p-0">
        <form method="get" className="flex gap-2 p-4" role="search">
          <Input
            name="q"
            type="search"
            defaultValue={q}
            placeholder="Buscar por nombre, SKU o número de parte"
            aria-label="Buscar items"
            className="max-w-md"
          />
          <Button type="submit" variant="outline">Buscar</Button>
          {q && (
            <Link href={`/${org}/bodega`} className={buttonVariants({ variant: "ghost" })}>
              Limpiar
            </Link>
          )}
        </form>
      </PageSection>
      <PageSection
        label={`${total} ${total === 1 ? "item" : "items"}${q ? ` para “${q}”` : ""}`}
        className="p-0"
      >
        {rows.length === 0 ? (
          <div className="flex flex-col items-start gap-4 p-6">
            <p className="text-muted-foreground">
              {q ? "Ningún item coincide con la búsqueda." : "Todavía no hay items en la bodega."}
            </p>
            {!q && (
              <Link href={newHref} className={buttonVariants()}>
                Crear el primero
              </Link>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th scope="col" className={TH}>SKU</th>
                  <th scope="col" className={TH}>Item</th>
                  <th scope="col" className={TH}>Línea / categoría</th>
                  <th scope="col" className={TH}>N.º de parte</th>
                  <th scope="col" className={`${TH} text-right`}>Existencias</th>
                  <th scope="col" className={`${TH} text-right`}>Costo s/IVA</th>
                  <th scope="col" className={`${TH} text-right`}>Margen</th>
                  <th scope="col" className={`${TH} text-right`}>Venta s/IVA</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cost = best.get(r.id);
                  const cat = r.category_id ? cats.get(r.category_id) : undefined;
                  return (
                    <tr key={r.id} className="border-b last:border-b-0 hover:bg-accent/60">
                      <td className={`${TD} num`}>{r.sku ?? "—"}</td>
                      <td className={`${TD} p-0`}>
                        <Link
                          href={`/${org}/bodega/${r.id}`}
                          className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                        >
                          {r.name}
                          {!r.is_active && (
                            <span className="ml-2 font-mono text-xs uppercase text-muted-foreground">inactivo</span>
                          )}
                        </Link>
                      </td>
                      <td className={TD}>{[r.line, cat].filter(Boolean).join(" / ") || "—"}</td>
                      <td className={`${TD} num`}>
                        {r.part_numbers[0] ?? "—"}
                        {r.part_numbers.length > 1 && (
                          <span className="ml-1 text-muted-foreground">+{r.part_numbers.length - 1}</span>
                        )}
                      </td>
                      <td className={cn(TD, "num text-right", !stock.get(r.id) && "text-muted-foreground")}>
                        {stock.get(r.id) ?? 0}
                      </td>
                      <td className={`${TD} num text-right`}>{cost !== undefined ? formatCents(cost) : "—"}</td>
                      <td className={`${TD} num text-right`}>{Number(r.margin_percent)}%</td>
                      <td className={`${TD} num text-right`}>
                        {cost !== undefined ? formatCents(salePriceCents(cost, Number(r.margin_percent))) : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <Pager basePath={`/${org}/bodega`} page={page} total={total} params={q ? { q } : {}} />
      </PageSection>
    </>
  );
}

export function ItemListPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  return (
    <>
      <h1 className="sr-only">Items de bodega</h1>
      <Suspense fallback={<PageSection label="Cargando…" />}>
        <List params={params} searchParams={searchParams} />
      </Suspense>
    </>
  );
}

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
  const { org } = await params;
  const sp = await searchParams;
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
      <PageSection>
        <h1 className="text-3xl font-semibold tracking-tight">Nuevo item</h1>
      </PageSection>
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
  const [itemRes, pricesRes, linksRes, options, role, lotsRes] = await Promise.all([
    supabase.from("items").select("*").eq("id", id).eq("organization_id", orgId).maybeSingle(),
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
  ]);
  const row = itemRes.data;
  if (!row) notFound();

  const item: ItemData = {
    id: row.id,
    name: row.name,
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
  const date = new Intl.DateTimeFormat("es-EC", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "America/Guayaquil",
  });
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
    date: date.format(new Date(l.created_at)),
    supplier: l.supplier_id ? (supplierName.get(l.supplier_id) ?? "") : "",
    costCents: l.unit_cost_cents === null ? null : Number(l.unit_cost_cents),
    received: Number(l.received_qty),
    remaining: Number(l.remaining_qty),
    kind: l.kind,
    note: l.note ?? "",
  }));

  return (
    <>
      <ItemForm org={org} item={item} canDelete={role === "admin"} {...options} />
      <StockPanel org={org} itemId={id} lots={lots} suppliers={options.suppliers} canEdit={role !== null} />
    </>
  );
}

export function ItemEditPage({ params }: { params: IdParams }) {
  return (
    <>
      <PageSection>
        <h1 className="text-3xl font-semibold tracking-tight">Editar item</h1>
      </PageSection>
      <Suspense>
        <EditForm params={params} />
      </Suspense>
    </>
  );
}

