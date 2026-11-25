"use client";

import Link from "next/link";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useRouter } from "next/navigation";
import { HeaderAction } from "@/components/header-action";
import { PageFigures, PageFooterActions, PagePagination } from "@/components/page-shortcuts";
import { PageSection } from "@/components/page-section";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { SearchInput } from "@/components/search-input";
import { SearchBar } from "@/components/url-search";
import { PageLoading } from "@/components/page-loading";
import { Pager } from "@/components/pager";
import { useDirectoryView } from "@/components/use-directory-view";
import { CLIENT_TYPES, CLIENT_TYPE_PLURAL, PARTIES } from "@/lib/parties";
import { directoryParams, type DirectoryView } from "@/lib/directory";
import { useState } from "react";

function DirectorySearch({ q, managers, onSearch }: { q: string; managers: boolean; onSearch: (text: string) => void }) {
  const [draft, setDraft] = useState({ q, text: q });
  if (draft.q !== q) setDraft({ q, text: q });
  return <SearchInput label={managers ? "Buscar responsables" : "Buscar clientes"} placeholder="Buscar por nombre, RUC, cédula o dirección" value={draft.q === q ? draft.text : q} onChange={(text) => setDraft({ q, text })} onSearch={onSearch} />;
}
export function DirectoryError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const router = useRouter();
  return <div role="alert" className="space-y-3 p-6"><p className="text-sm text-destructive">{message}</p><Button variant="outline" onClick={onRetry ?? (() => router.refresh())}>Reintentar</Button></div>;
}
export function DirectoryBoard({ org, initial }: { org: string; initial: DirectoryView }) {
  const { view, loading, error, select, retry } = useDirectoryView(org, initial);
  const { scope, q, page, rows, total } = view;
  const managers = scope === "managers";
  const cfg = PARTIES[managers ? "managers" : "clients"];
  const params = Object.fromEntries(directoryParams(scope, q));
  // El alta es una página (mismo formulario que items y activos); en clientes lleva el tipo de la pestaña elegida.
  const newHref = `/${org}/${cfg.path}/nuevo${!managers && scope ? `?tipo=${scope}` : ""}`;
  return <PageSection className="p-0">
    <h1 className="sr-only">Directorio · {managers ? "Responsables de contrato" : "Clientes"}</h1>
    <HeaderAction icon={Add01Icon} label={cfg.newLabel} href={newHref} />
    <PageFigures figures={[]} />
    <PageFooterActions><span className="whitespace-nowrap text-sm text-muted-foreground"><span className="num">{loading || error ? "—" : total}</span> {total === 1 ? cfg.singular : cfg.plural}</span></PageFooterActions>
    <SearchBar><DirectorySearch key={managers ? "managers" : "clients"} q={q} managers={managers} onSearch={(text) => void select(scope, 1, text)} /></SearchBar>
    {loading ? <PageLoading /> : error ? <DirectoryError message={error} onRetry={() => void retry()} /> : rows.length === 0 ? (
      <EmptyState fill image={q ? NO_RESULTS_IMAGE : "File Cabinet "} action={!q && <Link href={newHref} className={buttonVariants({ variant: "brand" })}>{cfg.newLabel}</Link>}>
        {q ? `Ningún ${cfg.singular} coincide con la búsqueda.` : managers ? cfg.empty : scope ? `Todavía no hay ${CLIENT_TYPE_PLURAL[scope].toLowerCase()} registradas.` : "Todavía no hay clientes en el directorio."}
      </EmptyState>
    ) : (
      <Table>
        <TableHeader className="bg-surface-strong">
          <TableRow className="hover:bg-transparent">
            <TableHead>Nombre</TableHead>
            {!managers && <TableHead>Tipo</TableHead>}
            <TableHead>RUC / cédula</TableHead>
            <TableHead>Dirección</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} className="hover:bg-accent/40">
              <TableCell className="p-0">
                <Link href={`/${org}/${cfg.path}/${row.id}`} className="block px-4 py-3 font-medium underline-offset-4 hover:underline">{row.name}</Link>
              </TableCell>
              {!managers && <TableCell>{row.client_type ? CLIENT_TYPES[row.client_type] : "—"}</TableCell>}
              <TableCell className="num">{row.ruc || "—"}</TableCell>
              <TableCell>{row.address || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    )}
    <PagePagination basePath={`/${org}/directorio`} page={page} total={loading || error ? 0 : total} params={params} />
    <Pager basePath={`/${org}/directorio`} page={page} total={loading || error ? 0 : total} params={params} className="md:hidden" />
  </PageSection>;
}
