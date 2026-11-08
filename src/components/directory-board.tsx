"use client";

import Link from "next/link";
import { PartyNewDialog } from "@/components/party-new-dialog";
import { Add01Icon } from "@hugeicons/core-free-icons";
import { useRouter } from "next/navigation";
import { HeaderAction } from "@/components/header-action";
import { PageFigures, PageFooterActions, PagePagination } from "@/components/page-shortcuts";
import { PageSection, TABLE_TH, TABLE_TD } from "@/components/page-section";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
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
  const [newOpen, setNewOpen] = useState(false);
  const kind = managers ? "managers" : "clients";
  const params = Object.fromEntries(directoryParams(scope, q));
  return <PageSection className="p-0">
    <h1 className="sr-only">Directorio · {managers ? "Responsables de contrato" : "Clientes"}</h1>
    <HeaderAction icon={Add01Icon} label={cfg.newLabel} onClick={() => setNewOpen(true)} />
    <PartyNewDialog org={org} kind={kind} defaultClientType={!managers && scope ? scope : undefined} open={newOpen} onOpenChange={setNewOpen} />
    <PageFigures figures={[]} />
    <PageFooterActions><span className="whitespace-nowrap text-sm text-muted-foreground"><span className="num">{loading || error ? "—" : total}</span> {total === 1 ? cfg.singular : cfg.plural}</span></PageFooterActions>
    <SearchBar><DirectorySearch key={managers ? "managers" : "clients"} q={q} managers={managers} onSearch={(text) => void select(scope, 1, text)} /></SearchBar>
    {loading ? <PageLoading /> : error ? <DirectoryError message={error} onRetry={() => void retry()} /> : rows.length === 0 ? (
      <EmptyState fill image={q ? NO_RESULTS_IMAGE : "File Cabinet "} action={!q && <Button variant="brand" onClick={() => setNewOpen(true)}>{cfg.newLabel}</Button>}>
        {q ? `Ningún ${cfg.singular} coincide con la búsqueda.` : managers ? cfg.empty : scope ? `Todavía no hay ${CLIENT_TYPE_PLURAL[scope].toLowerCase()} registradas.` : "Todavía no hay clientes en el directorio."}
      </EmptyState>
    ) : <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead className="bg-surface-strong"><tr className="border-b"><th scope="col" className={TABLE_TH}>Nombre</th>{!managers && <th scope="col" className={TABLE_TH}>Tipo</th>}<th scope="col" className={TABLE_TH}>RUC / cédula</th><th scope="col" className={TABLE_TH}>Dirección</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.id} className="border-b last:border-b-0 hover:bg-accent/40">
        <td className={`${TABLE_TD} p-0`}><Link href={`/${org}/${cfg.path}/${row.id}`} className="block px-4 py-3 font-medium underline-offset-4 hover:underline">{row.name}</Link></td>
        {!managers && <td className={TABLE_TD}>{row.client_type ? CLIENT_TYPES[row.client_type] : "—"}</td>}
        <td className={`${TABLE_TD} num`}>{row.ruc || "—"}</td><td className={TABLE_TD}>{row.address || "—"}</td>
      </tr>)}</tbody>
    </table></div>}
    <PagePagination basePath={`/${org}/directorio`} page={page} total={loading || error ? 0 : total} params={params} />
    <Pager basePath={`/${org}/directorio`} page={page} total={loading || error ? 0 : total} params={params} className="md:hidden" />
  </PageSection>;
}
