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
import { Button, buttonVariants } from "@/components/ui/button";
import { useWarehouseView } from "@/components/use-warehouse-view";
import { WarehouseAssetsTable, WarehouseItemsTable } from "@/components/warehouse-tables";
import type { WarehouseKind, WarehouseView } from "@/lib/warehouse";

function WarehouseSearch({ kind, q, onSearch }: { kind: WarehouseKind; q: string; onSearch: (text: string) => void }) {
  const [draft, setDraft] = useState({ q, text: q });
  if (draft.q !== q) setDraft({ q, text: q });
  return <SearchInput label={kind === "items" ? "Buscar items" : "Buscar activos"}
    placeholder={kind === "items" ? "Buscar por nombre, SKU o número de parte" : "Buscar por nombre, marca, modelo, serie, placa o identificación"}
    value={draft.q === q ? draft.text : q} onChange={(text) => setDraft({ q, text })} onSearch={onSearch} />;
}
export function WarehouseError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const router = useRouter();
  return <div role="alert" className="space-y-3 p-6"><p className="text-sm text-destructive">{message}</p><Button variant="outline" onClick={onRetry ?? (() => router.refresh())}>Reintentar</Button></div>;
}
export function WarehouseBoard({ org, initial }: { org: string; initial: WarehouseView }) {
  const { view, loading, error, select, retry } = useWarehouseView(org, initial);
  const { kind, q, total, page } = view;
  const assets = kind === "activos", noun = assets ? "activo" : "item";
  const newHref = assets ? `/${org}/bodega/activos/nuevo` : `/${org}/bodega/nuevo`;
  const params = { ...(q ? { q } : {}), ...(assets ? { vista: "activos" } : {}) };
  const shownTotal = loading || error ? 0 : total;
  return <>
    <h1 className="sr-only">{assets ? "Activos" : "Items de bodega"}</h1>
    <HeaderAction icon={Add01Icon} label={assets ? "Nuevo activo" : "Nuevo item"} href={newHref} />
    <PageFigures figures={[{ label: assets ? (total === 1 ? "Activo" : "Activos") : (total === 1 ? "Item" : "Items"), value: loading || error ? "—" : String(total), ...(q ? { note: "Resultados de búsqueda" } : {}) }]} />
    <SearchBar><WarehouseSearch key={kind} kind={kind} q={q} onSearch={(text) => void select(kind, 1, text)} /></SearchBar>
    <PageSection className="p-0">
      {loading ? <PageLoading /> : error ? <WarehouseError message={error} onRetry={() => void retry()} /> : view.rows.length === 0 ? (
        <EmptyState fill image={q ? NO_RESULTS_IMAGE : assets ? "Forklift" : "Dolly"}
          action={!q && <Link href={newHref} className={buttonVariants({ variant: "brand" })}>Crear el primero</Link>}>
          {q ? `Ningún ${noun} coincide con la búsqueda.` : assets ? "Todavía no hay activos. Registra los vehículos y la maquinaria a los que sirven tus items." : "Todavía no hay items en la bodega."}
        </EmptyState>
      ) : view.kind === "items" ? <WarehouseItemsTable org={org} rows={view.rows} /> : <WarehouseAssetsTable org={org} rows={view.rows} />}
      <PagePagination basePath={`/${org}/bodega`} page={page} total={shownTotal} params={params} />
      {!loading && !error && <p className="border-t px-6 py-3 caps-md text-muted-foreground md:hidden">{total} {total === 1 ? noun : `${noun}s`}{q ? " · Resultados de búsqueda" : ""}</p>}
      <Pager basePath={`/${org}/bodega`} page={page} total={shownTotal} params={params} className="md:hidden" />
    </PageSection>
  </>;
}
