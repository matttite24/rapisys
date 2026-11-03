import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ListView } from "@/components/contract-lists";
import { ReferenceList, type LineView } from "@/components/contract-lines";
import { PageSection } from "@/components/page-section";
import { getContract } from "@/lib/contract-data";
import { LINES_PAGE_SIZE, MAX_LINES_PER_LIST } from "@/lib/contracts";
import { findDuplicates } from "@/lib/duplicates";
import { pageCount, pageRange, readPage } from "@/lib/pagination";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

// Items del contrato: una lista por activo. Solo se carga la lista abierta, por páginas;
// de las demás solo se pide cuántas líneas tienen.
async function Items({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  await connection();
  const { org, id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const [found, listsRes, countsRes] = await Promise.all([
    getContract(org, id),
    supabase.from("contract_lists").select("id, asset_id, name").eq("contract_id", id).order("created_at"),
    supabase.rpc("contract_list_counts", { p_contract_id: id }),
  ]);
  if (!found) notFound();
  const { c } = found;
  // En Nuevo todavía no se cargan items.
  if (c.status === "new") {
    return (
      <PageSection>
        <p className="max-w-xl text-muted-foreground">
          Los items se cargan cuando el contrato pasa a <strong className="text-foreground">En ejecución</strong>.
          Mientras tanto, corrige los datos del contrato en{" "}
          <Link href={`/${org}/contratos/${id}`} className="underline underline-offset-4">Detalle</Link>.
        </p>
      </PageSection>
    );
  }

  const counts = new Map(
    ((countsRes.data ?? []) as { list_id: string; n: number }[]).map((r) => [r.list_id, Number(r.n)]),
  );
  const listRows = (listsRes.data ?? []) as { id: string; asset_id: string | null; name: string }[];
  const active = listRows.find((l) => l.id === first(sp.lista)) ?? listRows[0];

  const q = cleanSearch(first(sp.q) ?? "");
  const page = readPage(sp);
  const [from, to] = pageRange(page, LINES_PAGE_SIZE);

  // Líneas de la lista abierta: la página pedida, y las claves de toda la lista (máx. 1.000)
  // para numerarlas y marcar repetidas aunque estén en otra página.
  let pageQuery = supabase
    .from("contract_items")
    .select("id, list_id, part_number, description, quantity, unit, cpc", { count: "exact" })
    .eq("list_id", active?.id ?? "")
    .order("created_at")
    .order("id")
    .range(from, to);
  if (q) pageQuery = pageQuery.or(`part_number.ilike.%${q}%,description.ilike.%${q}%`);

  const assetIds = [...new Set(listRows.map((l) => l.asset_id).filter((x): x is string => !!x))];
  const [pageRes, keysRes, assetsRes] = await Promise.all([
    active ? pageQuery : Promise.resolve({ data: [], count: 0 }),
    active
      ? supabase
          .from("contract_items")
          .select("id, part_number, description")
          .eq("list_id", active.id)
          .order("created_at")
          .order("id")
          .limit(MAX_LINES_PER_LIST)
      : Promise.resolve({ data: [] }),
    assetIds.length
      ? supabase.from("assets").select("id, kind, brand, model, serial, engine, identifier").in("id", assetIds)
      : Promise.resolve({ data: [] }),
  ]);

  const total = pageRes.count ?? 0;
  // Si la página pedida ya no existe (se borraron líneas), se vuelve a la última.
  if (active && page > pageCount(total, LINES_PAGE_SIZE) && total > 0) {
    const back = new URLSearchParams({ lista: active.id, page: String(pageCount(total, LINES_PAGE_SIZE)) });
    if (q) back.set("q", q);
    redirect(`/${org}/contratos/${id}/items?${back}`);
  }

  const keys = (keysRes.data ?? []) as { id: string; part_number: string | null; description: string }[];
  const dups = findDuplicates(keys.map((k) => ({ part: k.part_number ?? "", description: k.description })), []);
  const info = new Map(keys.map((k, i) => [k.id, { n: i + 1, dupOf: dups[i]?.kind === "batch" ? dups[i]!.ref : undefined }]));

  const lines: LineView[] = (
    (pageRes.data ?? []) as {
      id: string;
      list_id: string;
      part_number: string | null;
      description: string;
      quantity: number;
      unit: string;
      cpc: string | null;
    }[]
  ).map((l, i) => ({
    id: l.id,
    listId: l.list_id,
    n: info.get(l.id)?.n ?? from + i + 1,
    dupOf: info.get(l.id)?.dupOf,
    partNumber: l.part_number ?? "",
    description: l.description,
    quantity: Number(l.quantity),
    unit: l.unit,
    cpc: l.cpc ?? "",
  }));

  // Los datos de la máquina son del activo del catálogo; las listas generales no tienen.
  const assetsById = new Map(
    ((assetsRes.data ?? []) as {
      id: string;
      kind: string;
      brand: string | null;
      model: string | null;
      serial: string | null;
      engine: string | null;
      identifier: string | null;
    }[]).map((a) => [a.id, a]),
  );
  const lists: ListView[] = listRows.map((l) => {
    const a = l.asset_id ? assetsById.get(l.asset_id) : undefined;
    return {
      id: l.id,
      assetId: l.asset_id,
      name: l.name,
      count: counts.get(l.id) ?? 0,
      kind: a?.kind ?? "",
      brand: a?.brand ?? "",
      model: a?.model ?? "",
      serial: a?.serial ?? "",
      engine: a?.engine ?? "",
      identifier: a?.identifier ?? "",
    };
  });

  return (
    <ReferenceList
      org={org}
      contractId={id}
      lists={lists}
      lines={lines}
      canAdd={c.status === "in_progress"}
      basePath={`/${org}/contratos/${id}/items`}
      activeId={active?.id ?? null}
      page={page}
      total={total}
      q={q}
    />
  );
}

export function ContractItemsPage({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  return (
    <Suspense fallback={<PageSection label="Cargando…" />}>
      <Items params={params} searchParams={searchParams} />
    </Suspense>
  );
}
