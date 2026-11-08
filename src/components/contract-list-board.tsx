"use client";

import Link from "next/link";

import { Add01Icon } from "@hugeicons/core-free-icons";
import { EmptyState, NO_RESULTS_IMAGE } from "@/components/empty-state";
import { HeaderAction } from "@/components/header-action";
import { PageSection } from "@/components/page-section";
import { ContractToolbar } from "@/components/contract-toolbar";
import { Pager } from "@/components/pager";
import { PageFigures, PagePagination } from "@/components/page-shortcuts";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusChip } from "@/components/status-chip";
import { formatIso } from "@/lib/dates";
import { formatCents } from "@/lib/money";
import { PAGE_SIZE } from "@/lib/pagination";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { PageLoading } from "@/components/page-loading";
import { useContractFilter } from "@/components/use-contract-filter";
import { CONTRACT_FILTERS, type ContractListView } from "@/lib/contract-filters";

export function ContractListError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const router = useRouter();
  return <div role="alert" className="space-y-3 p-6"><p className="text-sm text-destructive">{message}</p><Button variant="outline" onClick={onRetry ?? (() => router.refresh())}>Reintentar</Button></div>;
}
export function ContractListBoard({ org, initial }: { org: string; initial: ContractListView }) {
  const { rows, total, page, q, filter, loading, error, retry } = useContractFilter(org, initial);
  const newHref = `/${org}/contratos/nuevo`;
  const basePath = "/contratos";
  const size = PAGE_SIZE;
  return (
    <PageSection className="p-0">
      <h1 className="sr-only">{CONTRACT_FILTERS[filter].title}</h1>
      <HeaderAction icon={Add01Icon} label="Nuevo contrato" href={newHref} />
      <PageFigures figures={[{ label: total === 1 ? "Contrato" : "Contratos", value: loading || error ? "—" : String(total), ...(q ? { note: "Resultados de búsqueda" } : {}) }]} />
      <ContractToolbar q={q} />
      {loading ? <PageLoading /> : error ? <ContractListError message={error} onRetry={() => void retry()} /> : rows.length === 0 ? (
        <EmptyState
          fill
          image={q ? NO_RESULTS_IMAGE : "File Cabinet "}
          action={
            !q && (
              <Link href={newHref} className={buttonVariants({ variant: "brand" })}>
                Crear contrato
              </Link>
            )
          }
        >
          {q ? "Ningún contrato coincide con la búsqueda." : CONTRACT_FILTERS[filter].empty}
        </EmptyState>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Código</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Responsable</TableHead>
              <TableHead className="text-right">Total (IVA incl.)</TableHead>
              <TableHead>Plazo</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="num">{r.code}</TableCell>
                <TableCell className="p-0">
                  <Link
                    href={`/${org}/contratos/${r.id}`}
                    className="block px-4 py-3 font-medium underline-offset-4 hover:underline"
                  >
                    {r.name}
                  </Link>
                </TableCell>
                <TableCell>{r.clients?.name}</TableCell>
                <TableCell>{r.contract_managers?.name}</TableCell>
                <TableCell className="num text-right">{formatCents(Number(r.total_cents))}</TableCell>
                <TableCell className="whitespace-nowrap">
                  <span className="num">{r.term_days} {r.term_days === 1 ? "día" : "días"}</span>
                  <span className="block text-xs text-muted-foreground">desde {formatIso(r.start_date)}</span>
                </TableCell>
                <TableCell>
                  <StatusChip status={r.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <PagePagination basePath={`/${org}${basePath}`} page={page} total={loading || error ? 0 : total} size={size} params={{ ...(q ? { q } : {}), ...(filter ? { estado: filter } : {}) }} />
      {!loading && !error && <p className="border-t px-6 py-3 caps-md text-muted-foreground md:hidden">
        {total} {total === 1 ? "contrato" : "contratos"}{q ? " · Resultados de búsqueda" : ""}
      </p>}
      <Pager basePath={`/${org}${basePath}`} page={page} total={loading || error ? 0 : total} size={size} params={{ ...(q ? { q } : {}), ...(filter ? { estado: filter } : {}) }} className="md:hidden" />
    </PageSection>
  );
}
