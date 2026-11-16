import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ListView } from "@/components/contract-lists-model";
import { PageSection } from "@/components/page-section";
import { SupplyBoard, SupplySkeleton, type SupplyLine, type SupplyState } from "@/components/supply-board";
import { getContract } from "@/lib/contract-data";
import { assetExtras } from "@/lib/asset-extras";
import { LINES_PAGE_SIZE } from "@/lib/contracts";
import { pageCount, pageRange, readPage } from "@/lib/pagination";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATES: SupplyState[] = ["pending", "quoted", "partial", "purchased", "in_stock", "delivered"];

type View = {
  status: string;
  active_id: string | null;
  total: number;
  deliveries: number;
  counts: Partial<Record<SupplyState, number>>;
  lists: {
    id: string;
    asset_id: string | null;
    name: string;
    count: number;
    asset: {
      kind: string;
      brand: string | null;
      model: string | null;
      serial: string | null;
      engine: string | null;
      identifier: string | null;
    } | null;
  }[];
  lines: {
    id: string;
    list_id: string;
    n: number;
    part_number: string | null;
    description: string;
    quantity: number;
    unit: string;
    reserved: number;
    purchased: number;
    delivered: number;
    cost_cents: number | null;
    state: SupplyState;
  }[];
};

// Abastecimiento del proceso: cada línea de la lista abierta, con cuánto está cubierto. Todo llega
// en una sola llamada a la base (`contract_supply_view`), por páginas.
async function Supply({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  await connection();
  const [{ org, id }, sp, supabase] = await Promise.all([params, searchParams, createClient()]);

  const q = cleanSearch(first(sp.q) ?? "");
  const estado = STATES.find((s) => s === first(sp.estado)) ?? "";
  const page = readPage(sp);
  const [from] = pageRange(page, LINES_PAGE_SIZE);

  // La lista, el proceso y el resumen de costos no dependen unos de otros.
  const [{ data }, contract, { data: costData }] = await Promise.all([
    supabase.rpc("contract_supply_view", {
      p_contract_id: id,
      p_list_id: first(sp.lista) ?? null,
      p_q: q,
      p_state: estado,
      p_offset: from,
      p_limit: LINES_PAGE_SIZE,
    }),
    getContract(org, id),
    supabase.rpc("contract_supply_cost", { p_contract_id: id }),
  ]);
  const view = data as View | null;
  if (!view) notFound();
  const cost = costData as { cost_cents: number; unknown: number } | null;

  if (view.status === "new") {
    return (
      <PageSection>
        <p className="max-w-xl text-muted-foreground">
          El abastecimiento se trabaja cuando el proceso pasa a <strong className="text-foreground">En ejecución</strong>.
          Mientras tanto, corrige los datos del proceso en{" "}
          <Link href={`/${org}/contratos/${id}`} className="underline underline-offset-4">Detalle</Link>.
        </p>
      </PageSection>
    );
  }

  const total = Number(view.total);
  if (view.active_id && total > 0 && page > pageCount(total, LINES_PAGE_SIZE)) {
    const back = new URLSearchParams({ lista: view.active_id, page: String(pageCount(total, LINES_PAGE_SIZE)) });
    if (q) back.set("q", q);
    if (estado) back.set("estado", estado);
    redirect(`/${org}/contratos/${id}/abastecimiento?${back}`);
  }

  const lineIds = view.lines.map((l) => l.id);
  const [extras, { data: priceRows }, { data: srcRows }] = await Promise.all([
    assetExtras(supabase, view.lists.map((l) => l.asset_id)),
    // Precio referencial (total de la fila) de las líneas de esta página.
    lineIds.length
      ? supabase.from("contract_items").select("id, reference_price_cents, internal_code").in("id", lineIds)
      : Promise.resolve({ data: [] }),
    lineIds.length
      ? supabase.from("supply_sources")
          .select("contract_item_id, item_id, quantity, kind, unit_cost_cents")
          .in("contract_item_id", lineIds).order("created_at")
      : Promise.resolve({ data: [] }),
  ]);
  const lists: ListView[] = view.lists.map((l) => ({
    id: l.id,
    assetId: l.asset_id,
    name: l.name,
    count: Number(l.count),
    kind: l.asset?.kind ?? "",
    brand: l.asset?.brand ?? "",
    model: l.asset?.model ?? "",
    serial: l.asset?.serial ?? "",
    engine: l.asset?.engine ?? "",
    year: (l.asset_id && extras.get(l.asset_id)?.year) || "",
    identifier: l.asset?.identifier ?? "",
    other: (l.asset_id && extras.get(l.asset_id)?.other) || "",
    plate: (l.asset_id && extras.get(l.asset_id)?.plate) || "",
  }));

  // Lo asignado ya llegó junto con los datos adicionales de los activos.
  const sources = (srcRows ?? []) as {
    contract_item_id: string;
    item_id: string;
    quantity: number;
    kind: "bodega" | "compra";
    unit_cost_cents: number | null;
  }[];
  const { data: itemRows } = sources.length
    ? await supabase.from("items").select("id, name, sku, part_numbers").in("id", [...new Set(sources.map((x) => x.item_id))])
    : { data: [] };
  const itemById = new Map(
    ((itemRows ?? []) as { id: string; name: string; sku: string | null; part_numbers: string[] }[]).map((i) => [i.id, i]),
  );

  const refById = new Map(
    ((priceRows ?? []) as { id: string; reference_price_cents: number | null }[]).map((r) => [
      r.id,
      r.reference_price_cents === null ? null : Number(r.reference_price_cents),
    ]),
  );

  const codeById = new Map(
    ((priceRows ?? []) as { id: string; internal_code?: string | null }[]).map((r) => [r.id, r.internal_code ?? ""]),
  );

  const lines: SupplyLine[] = view.lines.map((l) => ({
    id: l.id,
    referenceCents: refById.get(l.id) ?? null,
    listId: l.list_id,
    n: Number(l.n),
    partNumber: l.part_number ?? "",
    internalCode: codeById.get(l.id) ?? "",
    description: l.description,
    quantity: Number(l.quantity),
    unit: l.unit,
    reserved: Number(l.reserved),
    purchased: Number(l.purchased),
    delivered: Number(l.delivered),
    costCents: l.cost_cents === null ? null : Number(l.cost_cents),
    state: l.state,
    assigned: sources
      .filter((x) => x.contract_item_id === l.id)
      .map((x) => {
        const item = itemById.get(x.item_id);
        return {
          name: item?.name ?? "Producto eliminado",
          code: item?.part_numbers?.[0] ?? item?.sku ?? "",
          quantity: Number(x.quantity),
          kind: x.kind,
          costCents: x.unit_cost_cents === null ? null : Number(x.unit_cost_cents),
        };
      }),
  }));

  return (
    <SupplyBoard
      org={org}
      contractId={id}
      lists={lists}
      lines={lines}
      counts={{
        pending: view.counts.pending ?? 0,
        quoted: view.counts.quoted ?? 0,
        partial: view.counts.partial ?? 0,
        purchased: view.counts.purchased ?? 0,
        in_stock: view.counts.in_stock ?? 0,
        delivered: view.counts.delivered ?? 0,
      }}
      activeId={view.active_id}
      page={page}
      total={total}
      q={q}
      estado={estado}
      basePath={`/${org}/contratos/${id}/abastecimiento`}
      canAct={view.status === "in_progress"}
      money={
        contract && contract.c.kind !== "credit"
          ? {
              totalCents: Number(contract.c.total_cents),
              vatRate: Number(contract.c.vat_rate),
              coveredCents: Number(cost?.cost_cents ?? 0),
              unknown: Number(cost?.unknown ?? 0),
            }
          : null
      }
    />
  );
}

export function ContractSupplyPage({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  return (
    <Suspense fallback={<SupplySkeleton />}>
      <Supply params={params} searchParams={searchParams} />
    </Suspense>
  );
}
