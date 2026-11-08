import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ListView } from "@/components/contract-lists-model";
import { ReferenceList } from "@/components/contract-lines";
import { ItemsSkeleton } from "@/components/contract-lines-skeleton";
import type { LineView } from "@/components/contract-lines-model";
import { PageSection } from "@/components/page-section";
import { assetExtras } from "@/lib/asset-extras";
import { LINES_PAGE_SIZE } from "@/lib/contracts";
import { findDuplicates } from "@/lib/duplicates";
import { pageCount, pageRange, readPage } from "@/lib/pagination";
import { cleanSearch } from "@/lib/search";
import { createClient } from "@/lib/supabase/server";

type IdParams = Promise<{ org: string; id: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type View = {
  status: string;
  active_id: string | null;
  total: number;
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
    part_number: string | null;
    description: string;
    quantity: number;
    unit: string;
  }[];
  keys: { id: string; part: string | null; description: string }[];
};

// Items del contrato: una lista por activo. Solo se carga la lista abierta, por páginas; de las
// demás solo su conteo. Todo llega en una sola llamada a la base (`contract_items_view`).
async function Items({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  await connection();
  const [{ org, id }, sp, supabase] = await Promise.all([params, searchParams, createClient()]);

  const q = cleanSearch(first(sp.q) ?? "");
  const page = readPage(sp);
  const [from] = pageRange(page, LINES_PAGE_SIZE);

  const { data } = await supabase.rpc("contract_items_view", {
    p_contract_id: id,
    p_list_id: first(sp.lista) ?? null,
    p_q: q,
    p_offset: from,
    p_limit: LINES_PAGE_SIZE,
  });
  const view = data as View | null;
  if (!view) notFound();

  // En Nuevo todavía no se cargan items.
  if (view.status === "new") {
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

  const total = Number(view.total);
  // Si la página pedida ya no existe (se borraron líneas), se vuelve a la última.
  if (view.active_id && total > 0 && page > pageCount(total, LINES_PAGE_SIZE)) {
    const back = new URLSearchParams({ lista: view.active_id, page: String(pageCount(total, LINES_PAGE_SIZE)) });
    if (q) back.set("q", q);
    redirect(`/${org}/contratos/${id}/items?${back}`);
  }

  // Posición real de cada línea en su lista y a cuál se parece si está repetida (toda la lista, no solo la página).
  const dups = findDuplicates(view.keys.map((k) => ({ part: k.part ?? "", description: k.description })), []);
  const info = new Map(
    view.keys.map((k, i) => [k.id, { n: i + 1, dupOf: dups[i]?.kind === "batch" ? dups[i]!.ref : undefined }]),
  );

  // El precio referencial no viene en la función de la lista: se piden aparte los de las líneas de esta página.
  const lineIds = view.lines.map((l) => l.id);
  const priceRes = lineIds.length
    ? await supabase.from("contract_items").select("id, reference_price_cents").in("id", lineIds)
    : { data: [] };
  const prices = new Map(
    ((priceRes.data ?? []) as { id: string; reference_price_cents: number | null }[]).map((r) => [
      r.id,
      r.reference_price_cents === null ? null : Number(r.reference_price_cents),
    ]),
  );

  const lines: LineView[] = view.lines.map((l, i) => ({
    id: l.id,
    listId: l.list_id,
    n: info.get(l.id)?.n ?? from + i + 1,
    dupOf: info.get(l.id)?.dupOf,
    partNumber: l.part_number ?? "",
    description: l.description,
    quantity: Number(l.quantity),
    unit: l.unit,
    referencePriceCents: prices.get(l.id) ?? null,
  }));

  const extras = await assetExtras(supabase, view.lists.map((l) => l.asset_id));
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

  return (
    <ReferenceList
      org={org}
      contractId={id}
      lists={lists}
      lines={lines}
      canAdd={view.status === "in_progress"}
      basePath={`/${org}/contratos/${id}/items`}
      activeId={view.active_id}
      page={page}
      total={total}
      q={q}
    />
  );
}

export function ContractItemsPage({ params, searchParams }: { params: IdParams; searchParams: Search }) {
  return (
    <Suspense fallback={<ItemsSkeleton />}>
      <Items params={params} searchParams={searchParams} />
    </Suspense>
  );
}
