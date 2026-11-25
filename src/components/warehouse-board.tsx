"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { HeaderAction } from "@/components/header-action";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { PageFigures, PagePagination } from "@/components/page-shortcuts";
import { PageSection } from "@/components/page-section";
import { Pager } from "@/components/pager";
import { PageLoading } from "@/components/page-loading";
import { SearchBar } from "@/components/url-search";
import { SearchInput } from "@/components/search-input";
import { AssetImport } from "@/components/asset-import";
import { ItemImport } from "@/components/item-import";
import { Button, buttonVariants } from "@/components/ui/button";
import { useWarehouseView } from "@/components/use-warehouse-view";
import { WarehouseAssetsTable, WarehouseItemsTable, WarehouseSuppliersTable } from "@/components/warehouse-tables";
import type { WarehouseKind, WarehouseView } from "@/lib/warehouse";

// Textos de cada catálogo de la bodega.
const COPY = {
  items: { search: "Buscar items", placeholder: "Buscar por nombre, SKU o número de parte", noun: "item", plural: "items", title: "Items de bodega", newLabel: "Nuevo item", newPath: "nuevo", image: "Dolly", empty: "Todavía no hay items en la bodega.", figure: ["Item", "Items"] },
  activos: { search: "Buscar activos", placeholder: "Buscar por nombre, marca, modelo, serie, placa o identificación", noun: "activo", plural: "activos", title: "Activos", newLabel: "Nuevo activo", newPath: "activos/nuevo", image: "Forklift", empty: "Todavía no hay activos. Registra los vehículos y la maquinaria a los que sirven tus items.", figure: ["Activo", "Activos"] },
  proveedores: { search: "Buscar proveedores", placeholder: "Buscar por nombre, RUC, cédula o dirección", noun: "proveedor", plural: "proveedores", title: "Proveedores", newLabel: "Nuevo proveedor", newPath: "proveedores/nuevo", image: "File Cabinet ", empty: "Todavía no hay proveedores.", figure: ["Proveedor", "Proveedores"] },
} as const;

function WarehouseSearch({ kind, q, onSearch }: { kind: WarehouseKind; q: string; onSearch: (text: string) => void }) {
  const [draft, setDraft] = useState({ q, text: q });
  if (draft.q !== q) setDraft({ q, text: q });
  return <SearchInput label={COPY[kind].search} placeholder={COPY[kind].placeholder}
    value={draft.q === q ? draft.text : q} onChange={(text) => setDraft({ q, text })} onSearch={onSearch} />;
}
export function WarehouseError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const router = useRouter();
  return <div role="alert" className="space-y-3 p-6"><p className="text-sm text-destructive">{message}</p><Button variant="outline" onClick={onRetry ?? (() => router.refresh())}>Reintentar</Button></div>;
}
export function WarehouseBoard({ org, initial }: { org: string; initial: WarehouseView }) {
  const { view, loading, error, select, retry } = useWarehouseView(org, initial);
  const { kind, q, total, page } = view;
  const copy = COPY[kind], noun = copy.noun;
  const newHref = `/${org}/bodega/${copy.newPath}`;
  const params = { ...(q ? { q } : {}), ...(kind !== "items" ? { vista: kind } : {}) };
  const shownTotal = loading || error ? 0 : total;
  return <>
    <h1 className="sr-only">{copy.title}</h1>
    {kind === "activos" ? <AssetImport org={org} /> : kind === "items" ? <ItemImport org={org} /> : null}
    <HeaderAction icon={Add01Icon} label={copy.newLabel} href={newHref} />
    <PageFigures figures={[{ label: total === 1 ? copy.figure[0] : copy.figure[1], value: loading || error ? "—" : String(total), ...(q ? { note: "Resultados de búsqueda" } : {}) }]} />
    <SearchBar><WarehouseSearch key={kind} kind={kind} q={q} onSearch={(text) => void select(kind, 1, text)} /></SearchBar>
    <PageSection className="p-0">
      {loading ? <PageLoading /> : error ? <WarehouseError message={error} onRetry={() => void retry()} /> : view.rows.length === 0 ? (
        <EmptyState fill image={q ? NO_RESULTS_IMAGE : copy.image}
          action={!q && <Link href={newHref} className={buttonVariants({ variant: "brand" })}>Crear el primero</Link>}>
          {q ? `Ningún ${noun} coincide con la búsqueda.` : copy.empty}
        </EmptyState>
      ) : view.kind === "items" ? <WarehouseItemsTable org={org} rows={view.rows} /> : view.kind === "activos" ? <WarehouseAssetsTable org={org} rows={view.rows} /> : <WarehouseSuppliersTable org={org} rows={view.rows} />}
      <PagePagination basePath={`/${org}/bodega`} page={page} total={shownTotal} params={params} />
      {!loading && !error && <p className="border-t px-6 py-3 caps-md text-muted-foreground md:hidden">{total} {total === 1 ? noun : copy.plural}{q ? " · Resultados de búsqueda" : ""}</p>}
      <Pager basePath={`/${org}/bodega`} page={page} total={shownTotal} params={params} className="md:hidden" />
    </PageSection>
  </>;
}
