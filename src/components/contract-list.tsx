import { Suspense } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { ContractListBoard, ContractListError } from "@/components/contract-list-board";
import { PageLoading } from "@/components/page-loading";
import { loadContractList } from "@/lib/contract-list-data";
import { contractFilter } from "@/lib/contract-filters";
import { PAGE_SIZE, pageCount, readPage } from "@/lib/pagination";

type Props = { params: Promise<{ org: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;
async function List({ params, searchParams }: Props) {
  await connection();
  const [{ org }, search] = await Promise.all([params, searchParams]);
  const result = await loadContractList(org, first(search.q) ?? "", contractFilter(first(search.estado) ?? ""), readPage(search));
  if (!result.view) return <ContractListError message={result.error ?? "No se pudieron cargar los contratos."} />;
  const view = result.view;
  if (view.page > pageCount(view.total, PAGE_SIZE)) {
    const params = new URLSearchParams({ ...(view.q ? { q: view.q } : {}), ...(view.filter ? { estado: view.filter } : {}), page: String(pageCount(view.total, PAGE_SIZE)) });
    redirect(`/${org}/contratos?${params}`);
  }
  return <ContractListBoard org={org} initial={view} />;
}
export function ContractListPage(props: Props) {
  return <Suspense fallback={<PageLoading />}><List {...props} /></Suspense>;
}
