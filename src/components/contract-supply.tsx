import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ListView } from "@/components/contract-lists";
import { PageSection } from "@/components/page-section";
import { SupplyBoard, SupplySkeleton, type SupplyLine, type SupplyState } from "@/components/supply-board";
import { LINES_PAGE_SIZE } from "@/lib/contracts";
import { pageCount, pageRange, readPage } from "@/lib/pagination";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const STATES: SupplyState[] = ["pending", "partial", "in_stock"];

type View = {
  status: string;
  active_id: string | null;
  total: number;
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
    cpc: string | null;
    reserved: number;
    cost_cents: number | null;
    state: SupplyState;
  }[];
};

// Abastecimiento del contrato: cada línea de la lista abierta, con cuánto está cubierto. Todo llega
// en una sola llamada a la base (`contract_supply_view`), por páginas.
async function Supply({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  await connection();
  const { org, id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const q = cleanSearch(first(sp.q) ?? "");
  const estado = STATES.find((s) => s === first(sp.estado)) ?? "";
  const page = readPage(sp);
  const [from] = pageRange(page, LINES_PAGE_SIZE);

  const { data } = await supabase.rpc("contract_supply_view", {
    p_contract_id: id,
    p_list_id: first(sp.lista) ?? null,
    p_q: q,
    p_state: estado,
    p_offset: from,
    p_limit: LINES_PAGE_SIZE,
  });
  const view = data as View | null;
  if (!view) notFound();

  if (view.status === "new") {
    return (
      <PageSection>
        <p className="max-w-xl text-muted-foreground">
          El abastecimiento se trabaja cuando el contrato pasa a <strong className="text-foreground">En ejecución</strong>.
          Mientras tanto, corrige los datos del contrato en{" "}
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
    identifier: l.asset?.identifier ?? "",
  }));

  const lines: SupplyLine[] = view.lines.map((l) => ({
    id: l.id,
    listId: l.list_id,
    n: Number(l.n),
    partNumber: l.part_number ?? "",
    description: l.description,
    quantity: Number(l.quantity),
    unit: l.unit,
    cpc: l.cpc ?? "",
    reserved: Number(l.reserved),
    costCents: l.cost_cents === null ? null : Number(l.cost_cents),
    state: l.state,
  }));

  return (
    <SupplyBoard
      org={org}
      contractId={id}
      lists={lists}
      lines={lines}
      counts={{ pending: view.counts.pending ?? 0, partial: view.counts.partial ?? 0, in_stock: view.counts.in_stock ?? 0 }}
      activeId={view.active_id}
      page={page}
      total={total}
      q={q}
      estado={estado}
      basePath={`/${org}/contratos/${id}/abastecimiento`}
      canAct={view.status === "in_progress"}
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
